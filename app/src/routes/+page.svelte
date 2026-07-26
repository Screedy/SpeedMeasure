<script lang="ts">
	import '../styles/dashboard.css';
	import '../styles/table.css';
	import { onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import Chart from '$lib/components/Chart.svelte';
	import NavStrip from '$lib/components/NavStrip.svelte';
	import Spark from '$lib/components/Spark.svelte';
	import { COLORS, DAY, HOUR, SERIES, fmtTime, num, toLocalInput, type SeriesKey } from '$lib/format';
	import { m } from '$lib/paraglide/messages';
	import { testStatus } from '$lib/testStatus.svelte';

	let { data } = $props();

	const LIVE_POLL_MS = 15_000;

	let enabled = $state<Record<SeriesKey, boolean>>({
		download: true,
		upload: true,
		ping: true,
		jitter: true,
		loss: true
	});
	let live = $state(false);
	let customOpen = $state(false);
	let pins = $state<number[]>([]);
	let mark = $state<number | null>(null);
	/** Ranges we zoomed out of, so "Zoom out" is an undo rather than a guess. */
	let zoomStack = $state<{ from: number; to: number }[]>([]);

	const span = $derived(data.to - data.from);
	const labels: Record<SeriesKey, string> = {
		download: m.series_download(),
		upload: m.series_upload(),
		ping: m.series_ping(),
		jitter: m.series_jitter(),
		loss: m.series_loss()
	};
	// --- navigation ----------------------------------------------------------

	/** All view state lives in the URL, so a window is a link and back/forward just work. */
	function navigate(params: Record<string, string | number | null>) {
		const url = new URL(page.url);
		for (const [k, v] of Object.entries(params)) {
			if (v === null || v === '') url.searchParams.delete(k);
			else url.searchParams.set(k, String(v));
		}
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	// A dragged/typed window is a deliberate, absolute selection — clear any active
	// preset (`range=`) so it stops rolling forward with new data.
	function setRange(from: number, to: number, push = false) {
		if (push) zoomStack.push({ from: data.from, to: data.to });
		navigate({
			from: Math.round(Math.min(from, to)),
			to: Math.round(Math.max(from, to)),
			range: null,
			page: 1
		});
	}

	// A preset is a rolling window — just its id goes in the URL, and the server
	// re-derives from/to off the current overview on every load, so it keeps following
	// new measurements instead of freezing at whatever "now" was when it was clicked.
	function preset(id: string) {
		zoomStack = [];
		navigate({ range: id, from: null, to: null, page: 1 });
	}

	function zoomOut() {
		const prev = zoomStack.pop();
		if (prev) navigate({ from: prev.from, to: prev.to, range: null, page: 1 });
	}

	const presets = [
		{ id: '24h', label: '24h' },
		{ id: '3d', label: '3d' },
		{ id: '7d', label: '7d' },
		{ id: '14d', label: '14d' },
		{ id: 'all', label: m.preset_all() }
	];

	const atLatest = $derived(Math.abs(data.to - data.overview.end) < 12 * HOUR);
	const isActivePreset = (id: string) => data.range === id;
	// A custom (dragged/typed) window has no preset id — show the date pickers whenever
	// one is active, or the user explicitly opened the panel to set one up.
	const showCustom = $derived(customOpen || data.range === null);

	const rangeLabel = $derived.by(() => {
		const hours = span / HOUR;
		return hours < 48
			? `${hours.toFixed(hours < 10 ? 1 : 0)}h`
			: `${(span / DAY).toFixed(span / DAY < 10 ? 1 : 0)}d`;
	});

	// --- live ----------------------------------------------------------------

	$effect(() => {
		if (!live) return;
		const timer = setInterval(async () => {
			await invalidateAll();
			// A preset (data.range) re-derives its own window server-side on every reload —
			// only a custom/dragged window pinned to the right edge needs a manual nudge.
			if (!data.range && atLatest) setRange(data.overview.end - span, data.overview.end);
		}, LIVE_POLL_MS);
		return () => clearInterval(timer);
	});

	// --- table ---------------------------------------------------------------

	const columns = [
		{ key: 't', label: m.col_timestamp(), align: 'left' },
		{ key: 'server', label: m.col_server(), align: 'left' },
		{ key: 'download', label: m.series_download(), align: 'right' },
		{ key: 'upload', label: m.series_upload(), align: 'right' },
		{ key: 'ping', label: m.series_ping(), align: 'right' },
		{ key: 'jitter', label: m.series_jitter(), align: 'right' }
	] as const;

	const sortBy = (key: string) =>
		navigate({ sort: key, dir: data.sortKey === key && data.desc ? 'asc' : 'desc', page: 1 });

	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	const exportHref = $derived(
		`/export?from=${data.from}&to=${data.to}${data.query ? `&q=${encodeURIComponent(data.query)}` : ''}`
	);

	let searchTimer: ReturnType<typeof setTimeout>;
	function onSearch(event: Event & { currentTarget: HTMLInputElement }) {
		const value = event.currentTarget.value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => navigate({ q: value, page: 1 }), 250);
	}

	function togglePin(t: number) {
		pins = pins.includes(t) ? pins.filter((p) => p !== t) : [...pins, t];
	}

	// --- cards ---------------------------------------------------------------

	const cards = $derived(
		SERIES.map((s) => {
			const values = data.buckets.map((b) => b[s.key]);
			const last = values.at(-1) ?? 0;
			const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
			const diff = avg ? ((last - avg) / avg) * 100 : 0;
			// Throughput is better when higher; latency, jitter and loss when lower.
			const higherIsBetter = s.key === 'download' || s.key === 'upload';
			const better = higherIsBetter ? diff >= 0 : diff <= 0;
			return {
				key: s.key,
				label: labels[s.key],
				unit: s.unit,
				value: num(last, s.key),
				avg: `${num(avg, s.key)} ${s.unit}`,
				diff,
				deltaColor: Math.abs(diff) < 1 ? 'var(--fg-4)' : better ? 'var(--download)' : 'var(--loss)',
				values
			};
		})
	);

	// Averaged over the whole window, not buckets[0] — the first bucket is usually
	// partial and would claim full resolution on a heavily downsampled range.
	const testsPerPoint = $derived(
		data.buckets.length ? Math.round(data.inRange / data.buckets.length) : 0
	);
	const aggregated = $derived(testsPerPoint > 1);

	// --- run test now ---------------------------------------------------------

	const RUN_POLL_MS = 3_000;
	// A real speed test can take the better part of a minute; give up rather than
	// poll forever if the runner never reports back (e.g. it's down or misconfigured).
	const RUN_TIMEOUT_MS = 90_000;

	let runState = $state<'idle' | 'running' | 'done'>('idle');
	let runTimer: ReturnType<typeof setInterval> | undefined;

	// Surfaced in the document title (via the root layout) so a running test is
	// visible even when this tab isn't focused.
	$effect(() => {
		testStatus.running = runState === 'running';
	});

	function stopRunPoll() {
		clearInterval(runTimer);
		runTimer = undefined;
	}

	/** Poll until a measurement newer than `sinceEnd` shows up, then refresh in place. */
	function awaitNewMeasurement(sinceEnd: number) {
		runState = 'running';
		const deadline = Date.now() + RUN_TIMEOUT_MS;
		stopRunPoll();
		runTimer = setInterval(async () => {
			await invalidateAll();
			if (data.overview.end > sinceEnd) {
				stopRunPoll();
				if (!data.range && atLatest) setRange(data.overview.end - span, data.overview.end);
				runState = 'done';
				setTimeout(() => (runState = 'idle'), 2000);
			} else if (Date.now() > deadline) {
				stopRunPoll();
				runState = 'idle';
			}
		}, RUN_POLL_MS);
	}

	onDestroy(() => {
		stopRunPoll();
		testStatus.running = false;
	});
</script>

<header class="pagehead">
	<div class="topline">
		<div class="pagehead__title"><h1>{m.speed_title()}</h1></div>

		<div class="controls">
			<div class="windowlabel">
				<span class="windowlabel__k">{m.window()}</span>
				<span class="mono windowlabel__v">{rangeLabel}</span>
			</div>

			<div class="presets">
				{#each presets as p (p.id)}
					<button class:on={isActivePreset(p.id)} onclick={() => preset(p.id)}>{p.label}</button>
				{/each}
				<button class:on={data.range === null} onclick={() => (customOpen = !customOpen)}>{m.custom()}</button>
			</div>

			<button class="btn live" class:live--on={live} onclick={() => (live = !live)} aria-pressed={live} title={m.live_hint()}>
				<span class="dot"></span>{live ? m.live() : m.paused()}
			</button>

			<form
				method="POST"
				action="?/runNow"
				use:enhance={() => {
					const sinceEnd = data.overview.end;
					return async ({ update }) => {
						await update({ reset: false });
						awaitNewMeasurement(sinceEnd);
					};
				}}
			>
				<button class="btn btn--accent" type="submit" disabled={runState === 'running'}>
					{runState === 'running' ? m.test_queued() : runState === 'done' ? m.test_done() : m.run_test()}
				</button>
			</form>
		</div>
	</div>

	<div class="navwrap">
		<NavStrip
			series={data.overview.series}
			start={data.overview.start}
			end={data.overview.end}
			from={data.from}
			to={data.to}
			onselect={(f, t) => setRange(f, t, true)}
		/>
		{#if showCustom}
			<div class="navfoot">
				<div class="daterange">
					<input
						type="datetime-local"
						value={toLocalInput(data.from)}
						onchange={(e) => {
							const t = new Date(e.currentTarget.value).getTime();
							if (!isNaN(t)) setRange(t, data.to, true);
						}}
					/>
					<span class="sep" aria-hidden="true">–</span>
					<input
						type="datetime-local"
						value={toLocalInput(data.to)}
						onchange={(e) => {
							const t = new Date(e.currentTarget.value).getTime();
							if (!isNaN(t)) setRange(data.from, t, true);
						}}
					/>
				</div>
			</div>
		{/if}
	</div>
</header>

<div class="scrollbody">
	<div class="statcards">
		{#each cards as card (card.key)}
			<div class="statcard">
				<div class="statcard__label">
					<span class="statcard__swatch" style:background={COLORS[card.key]}></span>{card.label}
				</div>
				<div class="statcard__value">
					<span class="mono statcard__num">{card.value}</span>
					<span class="statcard__unit">{card.unit}</span>
				</div>
				<div class="statcard__meta">
					<span class="mono" style:color={card.deltaColor}>
						{card.diff >= 0 ? '▲' : '▼'}
						{m.vs_avg({ delta: Math.abs(card.diff).toFixed(card.diff === 0 ? 0 : 1) })}
					</span>
					<span class="mono statcard__avg">{m.card_avg({ value: card.avg })}</span>
				</div>
				<div class="statcard__spark"><Spark values={card.values} color={COLORS[card.key]} /></div>
			</div>
		{/each}
	</div>

	<section class="panel chartpanel">
		<div class="panel__head">
			<div class="panel__title">{m.speed_over_time()}</div>
			<div class="hint">
				{aggregated
					? m.agg_aggregated({ points: data.buckets.length, per: testsPerPoint })
					: m.agg_raw({ points: data.buckets.length })}
			</div>
			{#if zoomStack.length}
				<button class="btn zoomout" onclick={zoomOut}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" />
					</svg>{m.zoom_out()}
				</button>
			{/if}
			<div class="legend">
				{#each SERIES as s (s.key)}
					<button class="legend__item" class:legend__item--off={!enabled[s.key]} onclick={() => (enabled[s.key] = !enabled[s.key])} aria-pressed={enabled[s.key]}>
						<span class="legend__dot" style:background={COLORS[s.key]}></span>{labels[s.key]}
					</button>
				{/each}
			</div>
		</div>

		<div class="chartbody">
			{#if data.buckets.length}
				<Chart buckets={data.buckets} from={data.from} to={data.to} {enabled} {pins} {mark} onzoom={(f, t) => setRange(f, t, true)} />
			{:else}
				<div class="table-empty">{m.no_results()}</div>
			{/if}
		</div>
	</section>

	<section class="panel">
		<div class="panel__head">
			<div class="panel__title">{m.raw_results()}</div>
			<span class="hint">{m.shown_of_range({ shown: data.total, total: data.inRange })}</span>
			{#if pins.length}
				<button class="pinclear" onclick={() => (pins = [])}>
					<span class="pinclear__dot"></span>Clear {pins.length}
				</button>
			{/if}
			<div class="tabletools">
				<div class="table-search">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4)" stroke-width="1.8">
						<circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
					</svg>
					<input type="search" value={data.query} oninput={onSearch} placeholder={m.filter_placeholder()} aria-label={m.filter_placeholder()} />
				</div>
				<a class="btn btn--accent" href={exportHref} download>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
						<path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" />
					</svg>{m.export_csv()}
				</a>
			</div>
		</div>

		<div class="tablewrap">
			<table class="datatable datatable--selectable">
				<colgroup>
					<col style="width: 130px" />
					<col />
					<col style="width: 90px" />
					<col style="width: 90px" />
					<col style="width: 80px" />
					<col style="width: 80px" />
				</colgroup>
				<thead>
					<tr>
						{#each columns as col (col.key)}
							<th style:text-align={col.align} class:sorted={data.sortKey === col.key}>
								<button style:justify-content={col.align === 'right' ? 'flex-end' : 'flex-start'} onclick={() => sortBy(col.key)}>
									{col.label}<span class="arrow">{data.sortKey === col.key ? (data.desc ? '▼' : '▲') : ''}</span>
								</button>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row (row.t + row.provider)}
						<tr
							class:pinned={pins.includes(row.t)}
							class:marked={mark === row.t}
							onmouseenter={() => (mark = row.t)}
							onmouseleave={() => (mark = null)}
							onclick={() => togglePin(row.t)}
						>
							<td class="mono">{fmtTime(row.t)}</td>
							<td class="server">
								<span class="server__dot"></span>{row.server}
								<span class="server__provider">{row.provider}</span>
							</td>
							<td class="mono n n--download">{num(row.download, 'download')}</td>
							<td class="mono n n--upload">{num(row.upload, 'upload')}</td>
							<td class="mono n n--ping">{num(row.ping, 'ping')}</td>
							<td class="mono n n--jitter">{num(row.jitter, 'jitter')}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if !data.rows.length}
				<div class="table-empty">{m.no_results()}</div>
			{/if}
		</div>

		<div class="pager">
			<span class="hint">{m.page_label({ page: data.page, pages: totalPages, shown: data.rows.length })}</span>
			<div class="pager__buttons">
				<button class="btn" disabled={data.page <= 1} onclick={() => navigate({ page: data.page - 1 })}>{m.prev()}</button>
				<button class="btn" disabled={data.page >= totalPages} onclick={() => navigate({ page: data.page + 1 })}>{m.next()}</button>
			</div>
		</div>
	</section>
</div>
