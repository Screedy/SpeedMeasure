<script lang="ts">
	import '../../styles/iperf.css';
	import { untrack } from 'svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import IperfChart from '$lib/components/IperfChart.svelte';
	import { m } from '$lib/paraglide/messages';
	import { isUnexpectedError, toastErrors } from '$lib/formError';
	import type { Direction, Protocol, TcpResult, UdpResult } from '$lib/server/iperf';

	let { data } = $props();

	// --- target selection -----------------------------------------------------
	
	let selectedId = $state<string | null>(untrack(() => data.targets[0]?.id ?? null));
	const selected = $derived(data.targets.find((t) => t.id === selectedId) ?? data.targets[0] ?? null);

	const CAP_PRESETS = [
		[1000, '1 GbE'],
		[2500, '2.5 GbE'],
		[10000, '10 GbE']
	] as const;
	const capLabel = (mbps: number | null) => {
		if (!mbps) return '—';
		const preset = CAP_PRESETS.find(([v]) => v === mbps);
		return preset ? preset[1] : `${mbps} Mb`;
	};

	let newLink = $state<number>(1000);

	// --- run parameters ---------------------------------------------------------

	let direction = $state<Direction>('down');
	let protocol = $state<Protocol>('tcp');
	let duration = $state(10);
	let streams = $state(1);

	const DIR_COLOR: Record<Direction, string> = { down: 'var(--download)', up: 'var(--upload)', bidir: 'var(--accent-2)' };
	const dirLabel = (d: Direction) => (d === 'up' ? m.series_upload() : d === 'bidir' ? m.iperf_bidir() : m.series_download());

	const cmd = $derived.by(() => {
		if (!selected) return '';
		
		const parts = ['iperf3', '-c', selected.host, '-p', String(selected.port), '-t', String(duration), '-P', String(streams)];
		
		if (direction === 'down') parts.push('-R');
		if (direction === 'bidir') parts.push('--bidir');
		if (protocol === 'udp') parts.push('-u', '-b', '0');
		
		return parts.join(' ');
	});

	// --- displayed run / live polling ------------------------------------------

	const run = $derived(data.displayedRun);
	const isLive = $derived(run?.status === 'pending' || run?.status === 'running');

	$effect(() => {
		if (!isLive) return;
		const timer = setInterval(() => invalidateAll(), 1000);
		return () => clearInterval(timer);
	});

	function fmtRate(mbps: number | null | undefined) {
		if (mbps == null) return '—';
		
		return mbps >= 1000 ? `${(mbps / 1000).toFixed(2)} Gbps` : `${mbps.toFixed(1)} Mbps`;
	}

	const statusText = $derived.by(() => {
		if (!run) return m.iperf_ready();
		if (run.status === 'pending') return m.iperf_starting();
		if (run.status === 'running') return m.iperf_running({ elapsed: run.samples.length, duration: run.duration });
		if (run.status === 'error') return m.iperf_failed();
		if (run.status === 'stopped') return m.iperf_stopped();
		
		return m.iperf_completed({ rate: fmtRate(run.result?.receiver) });
	});
	const progressPct = $derived(run && run.duration ? Math.min(100, Math.round((run.samples.length / run.duration) * 100)) : 0);

	const resultCards = $derived.by(() => {
		const r = run?.result;
		if (!r) return [];
		if (r.proto === 'udp') {
			const u = r as UdpResult;
			
			return [
				{ label: m.iperf_bitrate(), value: fmtRate(u.receiver), color: 'var(--download)' },
				{ label: m.series_jitter(), value: u.jitterMs != null ? `${u.jitterMs.toFixed(3)} ms` : '—', color: 'var(--jitter)' },
				{
					label: m.series_loss(),
					value: u.lossPct != null ? `${u.lossPct.toFixed(2)}%` : '—',
					color: u.lossPct && u.lossPct > 1 ? 'var(--loss)' : 'var(--download)'
				},
				{ label: m.iperf_datagrams_lost(), value: u.lost != null ? `${u.lost} / ${u.total}` : '—', color: 'var(--upload)' }
			];
		}
		const t = r as TcpResult;
		
		return [
			{ label: m.iperf_sender(), value: fmtRate(t.sender), color: 'var(--download)' },
			{ label: m.iperf_receiver(), value: fmtRate(t.receiver), color: 'var(--upload)' },
			{ label: m.iperf_retransmits(), value: String(t.retr), color: t.retr > 0 ? 'var(--ping)' : 'var(--download)' },
			{ label: m.iperf_cwnd(), value: t.cwndMB != null ? `${t.cwndMB.toFixed(2)} MB` : '—', color: 'var(--ping)' }
		];
	});

	// --- terminal ---------------------------------------------------------------

	function lineClass(line: string) {
		if (/\b(sender|receiver)\s*$/.test(line)) return 'term-result';
		if (/^-\s*-/.test(line)) return 'term-sep';
		if (/\bID\b.*Interval/.test(line)) return 'term-head';
		if (/^iperf Done/.test(line)) return 'term-ok';
		if (/^iperf3:/.test(line)) return 'term-err';
		if (/^(Connecting to host|Reverse mode|\[\s*\d+\] local)/.test(line)) return 'term-dim';
		return 'term-norm';
	}
	const termLines = $derived(run?.term ? run.term.split('\n').filter(Boolean) : []);

	let termEl = $state<HTMLElement>();
	// A terminal should follow its tail — but stop the moment the reader scrolls up to look at something.
	let followTail = $state(true);
	const runId = $derived(run?.id);

	const onTermScroll = () => {
		if (termEl) followTail = termEl.scrollHeight - termEl.scrollTop - termEl.clientHeight < 24;
	};

	// Selecting a different run should re-enable tail-following, so that the user sees the end of the new run.
	$effect(() => {
		void runId;
		followTail = true;
	});

	$effect(() => {
		if (termLines.length && termEl && untrack(() => followTail)) {
			termEl.scrollTop = termEl.scrollHeight;
		}
	});

	// --- run test ----------------------------------------------------------------

	function runTest() {
		return async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			await update({ reset: false });
			if (isUnexpectedError(result)) return;
			if (result.type === 'success' && result.data?.runId) {
				await goto(`?run=${result.data.runId}`, { replaceState: true, keepFocus: true, noScroll: true });
			}
		};
	}
</script>

<header class="pagehead">
	<div class="pagehead__title">
		<div>
			<h1>{m.iperf_title()}</h1>
			<div class="subtitle">{m.iperf_subtitle()}</div>
		</div>
	</div>
</header>

<div class="scrollbody">
	<div class="iperf-grid">
		<div class="iperf-col">
			<!-- Targets -->
			<section class="panel iperf-card">
				<div class="iperf-card__head">
					<h2>{m.target_node()}</h2>
					<span class="hint">iperf3 -s on host</span>
				</div>
				<div class="node-list">
					{#each data.targets as t (t.id)}
						<div
							class="node-row"
							class:node-row--active={t.id === selected?.id}
							role="radio"
							aria-checked={t.id === selected?.id}
							tabindex="0"
							onclick={() => (selectedId = t.id)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && ((selectedId = t.id), e.preventDefault())}
						>
							<span class="node-row__dot"></span>
							<div class="node-row__info">
								<div class="node-row__name">{t.name}</div>
								<div class="node-row__addr">{t.host}:{t.port}</div>
							</div>
							<span class="tag">{capLabel(t.linkMbps)}</span>
							{#if data.targets.length > 1}
								<form method="POST" action="?/removeTarget" use:enhance={toastErrors}>
									<input type="hidden" name="id" value={t.id} />
									<button type="submit" class="node-row__delete" title={m.remove_target()} onclick={(e) => e.stopPropagation()}>
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
									</button>
								</form>
							{/if}
						</div>
					{:else}
						<div class="hint" style="padding:6px 2px">{m.no_targets()}</div>
					{/each}
				</div>

				<div class="rule"></div>
				<div class="hint" style="margin-bottom:9px">{m.add_target()}</div>
				<form method="POST" action="?/addTarget" class="addtarget" use:enhance={toastErrors}>
					<input name="name" placeholder={m.target_label_placeholder()} />
					<div class="addtarget__row">
						<input name="host" placeholder={m.target_host_placeholder()} required class="mono" />
						<input type="number" name="port" value="5201" min="1" max="65535" class="mono addtarget__port" />
					</div>
					<input type="hidden" name="linkMbps" value={newLink} />
					<div class="chips">
						{#each CAP_PRESETS as [v, label] (v)}
							<button type="button" class="chip" class:chip--on={newLink === v} onclick={() => (newLink = v)}>{label}</button>
						{/each}
					</div>
					<button type="submit" class="btn">+ {m.add_target()}</button>
				</form>
			</section>

			<!-- Parameters -->
			<section class="panel iperf-card">
				<h2>{m.test_parameters()}</h2>
				<span class="label">{m.direction()}</span>
				<div class="seg">
					{#each (['down', 'up', 'bidir'] as const) as d (d)}
						<button type="button" aria-pressed={direction === d} onclick={() => (direction = d)}>{dirLabel(d)}</button>
					{/each}
				</div>
				<span class="label" style="margin-top:14px;display:block">{m.protocol()}</span>
				<div class="seg">
					{#each (['tcp', 'udp'] as const) as p (p)}
						<button type="button" aria-pressed={protocol === p} onclick={() => (protocol = p)}>{p.toUpperCase()}</button>
					{/each}
				</div>
				<div class="form-grid form-grid--two" style="margin-top:14px">
					<div class="field">
						<label for="ip-duration">{m.duration_s()}</label>
						<input id="ip-duration" type="number" min="1" max="60" bind:value={duration} />
					</div>
					<div class="field">
						<label for="ip-streams">{m.parallel_streams()}</label>
						<input id="ip-streams" type="number" min="1" max="128" bind:value={streams} />
					</div>
				</div>
				<div class="cmdpreview">
					<div class="hint">{m.command_label()}</div>
					<div class="cmdpreview__line">$ {cmd || '—'}</div>
				</div>
			</section>
		</div>

		<div class="iperf-col">
			<!-- Run panel -->
			<section class="panel iperf-card">
				<div class="runhead">
					<div class="runhead__info">
						<div class="runhead__name">
							<span>{selected?.name ?? m.no_targets()}</span>
							<span class="mono hint">{selected ? `${selected.host}:${selected.port}` : ''}</span>
						</div>
						<div class="runhead__badges">
							{#if selected}<span class="tag">{capLabel(selected.linkMbps)}</span>{/if}
							<span class="tag" style="color:{DIR_COLOR[direction]}">{dirLabel(direction)}</span>
							<span class="tag">{protocol.toUpperCase()}</span>
						</div>
					</div>
					{#if isLive}
						<form method="POST" action="?/stopRun" use:enhance={toastErrors}>
							<input type="hidden" name="id" value={run?.id} />
							<button type="submit" class="btn iperf-run-btn iperf-run-btn--stop">
								<span class="iperf-run-btn__dot"></span>{m.stop()}
							</button>
						</form>
					{:else}
						<form method="POST" action="?/runTest" use:enhance={runTest}>
							<input type="hidden" name="targetName" value={selected?.name ?? ''} />
							<input type="hidden" name="targetHost" value={selected?.host ?? ''} />
							<input type="hidden" name="targetPort" value={selected?.port ?? ''} />
							<input type="hidden" name="direction" value={direction} />
							<input type="hidden" name="protocol" value={protocol} />
							<input type="hidden" name="duration" value={duration} />
							<input type="hidden" name="streams" value={streams} />
							<button type="submit" class="btn btn--accent iperf-run-btn" disabled={!selected}>
								<span class="iperf-run-btn__dot"></span>{run ? m.run_again() : m.run_test()}
							</button>
						</form>
					{/if}
				</div>

				<div class="progressrow">
					<div class="progressbar"><div class="progressbar__fill" style:width="{progressPct}%"></div></div>
					<span class="mono progressrow__status">{statusText}</span>
				</div>

				<div class="iperf-chart">
					<IperfChart samples={run?.samples ?? []} duration={run?.duration ?? duration} linkMbps={run ? null : (selected?.linkMbps ?? null)} color={DIR_COLOR[run?.direction ?? direction]} />
				</div>

				{#if resultCards.length}
					<div class="resultcards">
						{#each resultCards as c (c.label)}
							<div class="resultcard">
								<div class="hint">{c.label}</div>
								<div class="resultcard__value" style:color={c.color}>{c.value}</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Terminal -->
			<section class="panel">
				<div class="panel__head"><span class="mono hint">{m.iperf_output()}</span></div>
				<div class="term" bind:this={termEl} onscroll={onTermScroll}>
					{#if termLines.length}
						{#each termLines as line, i (i)}
							<div class={lineClass(line)}>{line}</div>
						{/each}
					{:else}
						<div class="term-dim">$ {m.waiting_for_run()}</div>
					{/if}
				</div>
			</section>

			<!-- History -->
			<section class="panel iperf-card">
				<div class="iperf-card__head">
					<h2>{m.recent_runs()}</h2>
					<span class="hint">{m.click_to_reload()}</span>
				</div>
				{#if !data.history.length}
					<div class="table-empty">{m.no_runs_yet()}</div>
				{:else}
					<div class="history-list">
						{#each data.history as h (h.id)}
							<a href="?run={h.id}" class="history-row" class:history-row--active={h.id === run?.id}>
								<span class="history-row__dot" style:background={DIR_COLOR[h.direction]}></span>
								<div class="history-row__info">
									<div class="history-row__name">{h.targetName} <span class="mono hint">{h.targetHost}</span></div>
									<div class="hint">{dirLabel(h.direction)} · {h.protocol.toUpperCase()} · {h.duration}s · {h.streams}P</div>
								</div>
								<div class="history-row__stats">
									<div class="history-row__rate">{fmtRate(h.result?.receiver)}</div>
									<div class="hint mono">
										{h.status === 'error' ? m.iperf_failed() : h.status === 'stopped' ? m.iperf_stopped() : h.status}
									</div>
								</div>
								<form method="POST" action="?/deleteRun" use:enhance={toastErrors}>
									<input type="hidden" name="id" value={h.id} />
									<button type="submit" class="node-row__delete" title={m.delete_run()} onclick={(e) => e.stopPropagation()}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /></svg>
									</button>
								</form>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>
