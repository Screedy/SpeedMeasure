<script lang="ts">
	import '../../styles/alerts.css';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { Alert } from '$shared/alerts.mjs';
	import { DAY, HOUR, fmtClock, fmtDur, fmtWeekdayDate } from '$lib/format';
	import { m } from '$lib/paraglide/messages';

	let { data } = $props();

	type Severity = Alert['sev'];
	type Filter = Severity | 'all' | 'acknowledged';
	type DowntimeRange = 'month' | 'year' | 'all';

	let filter = $state<Filter>('all');
	let downtimeRange = $state<DowntimeRange>('month');

	const ackedSet = $derived(new Set(data.acked));
	const isAcked = (a: Alert) => ackedSet.has(a.id);
	const open = $derived(data.alerts.filter((a) => !isAcked(a)));

	const SEVERITIES: Severity[] = ['critical', 'warning', 'info'];

	const sevMeta: Record<Severity, { color: string; bg: string; label: string }> = {
		critical: { color: 'var(--loss)', bg: 'rgba(248,81,73,.13)', label: m.sev_critical() },
		warning: { color: 'var(--ping)', bg: 'rgba(210,153,34,.14)', label: m.sev_warning() },
		info: { color: 'var(--upload)', bg: 'rgba(88,166,255,.13)', label: m.sev_info() }
	};

	const titles: Record<Alert['kind'], string> = {
		outage: m.alert_outage(),
		sustained: m.alert_sustained(),
		loss: m.alert_loss(),
		latency: m.alert_latency()
	};

	const metricNames: Record<Alert['metric'], string> = {
		download: m.metric_download(),
		upload: m.metric_upload(),
		both: m.metric_both(),
		loss: m.metric_loss(),
		ping: m.metric_ping()
	};

	/** The engine emits numbers; the wording is chosen here, in the reader's language. */
	function detail(a: Alert) {
		const metric = metricNames[a.metric];
		switch (a.kind) {
			case 'outage':
				return m.detail_outage({ metric, value: a.params.value!, floor: a.params.floor! });
			case 'sustained':
				return m.detail_sustained({ metric, floor: a.params.floor!, duration: fmtDur(a.dur) });
			case 'loss':
				return m.detail_loss({ value: a.params.value! });
			case 'latency':
				return m.detail_latency({ value: a.params.value! });
		}
	}

	// --- stats ---------------------------------------------------------------

	const now = $derived(data.alerts[0]?.end ?? Date.now());

	const downtimeMs = $derived.by(() => {
		const outages = data.alerts.filter((a) => a.kind === 'outage' || a.kind === 'sustained');
		const d = new Date(now);
		const floor = {
			month: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
			year: new Date(d.getFullYear(), 0, 1).getTime(),
			all: -Infinity
		}[downtimeRange];
		return outages.filter((a) => a.start >= floor).reduce((sum, a) => sum + a.dur, 0);
	});

	const downtimeSub = $derived(
		{ month: m.dt_sub_month(), year: m.dt_sub_year(), all: m.dt_sub_all() }[downtimeRange]
	);

	function relative(t: number) {
		const diff = Date.now() - t;
		if (diff < HOUR) return m.ago_minutes({ count: Math.max(1, Math.round(diff / 60000)) });
		if (diff < DAY) return m.ago_hours({ count: Math.round(diff / HOUR) });
		return m.ago_days({ count: Math.round(diff / DAY) });
	}

	const criticalOpen = $derived(open.filter((a) => a.sev === 'critical').length);
	const latest = $derived(data.alerts[0]);

	// --- filtering + grouping ------------------------------------------------

	const counts = $derived({
		all: open.length,
		critical: open.filter((a) => a.sev === 'critical').length,
		warning: open.filter((a) => a.sev === 'warning').length,
		info: open.filter((a) => a.sev === 'info').length,
		acknowledged: data.acked.length
	});

	const shown = $derived(
		data.alerts.filter((a) =>
			filter === 'all' ? !isAcked(a) : filter === 'acknowledged' ? isAcked(a) : a.sev === filter && !isAcked(a)
		)
	);

	const groups = $derived.by(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const byDay = new Map<number, Alert[]>();
		for (const a of shown) {
			const d = new Date(a.start);
			d.setHours(0, 0, 0, 0);
			const key = d.getTime();
			byDay.set(key, [...(byDay.get(key) ?? []), a]);
		}

		return [...byDay].map(([key, items]) => {
			const daysAgo = Math.round((today.getTime() - key) / DAY);
			return {
				key,
				label: daysAgo === 0 ? m.today() : daysAgo === 1 ? m.yesterday() : fmtWeekdayDate(key),
				count: items.length === 1 ? m.alert_count_one() : m.alert_count({ count: items.length }),
				items
			};
		});
	});

	const emptyHint = $derived(
		filter === 'acknowledged'
			? m.empty_hint_ack()
			: filter === 'all'
				? m.empty_hint_all()
				: m.empty_hint_sev({ severity: sevMeta[filter as Severity].label.toLowerCase() })
	);

	/** Open the incident on the timeline: the whole day it happened, worst sample pinned. */
	function inspect(a: Alert) {
		const start = new Date(a.start);
		start.setHours(0, 0, 0, 0);
		goto(`/?from=${start.getTime()}&to=${start.getTime() + DAY}`);
	}
</script>

<header class="pagehead alerthead">
	<div class="pagehead__title">
		<div>
			<h1>{m.alerts_title()}</h1>
			<div class="subtitle">{m.alerts_subtitle()}</div>
		</div>
	</div>
	{#if open.length}
		<div class="openpill">
			<span class="openpill__dot"></span>
			<span class="mono">{m.alerts_open({ count: open.length })}</span>
		</div>
	{/if}
</header>

<div class="scrollbody">
	<div class="alerts__inner">
		<div class="stats">
			<div class="stat">
				<div class="stat__label">{m.stat_open()}</div>
				<div class="stat__value mono">{open.length}</div>
				<div class="stat__sub mono">{m.stat_open_sub({ count: data.acked.length })}</div>
			</div>
			<div class="stat">
				<div class="stat__label">{m.stat_critical()}</div>
				<div class="stat__value mono" style:color={criticalOpen ? 'var(--loss)' : 'var(--download)'}>{criticalOpen}</div>
				<div class="stat__sub mono">{criticalOpen ? m.stat_need_attention() : m.stat_all_clear()}</div>
			</div>
			<div class="stat">
				<div class="stat__label">{m.stat_downtime()}</div>
				<div class="stat__value mono" style:color="var(--ping)">{fmtDur(downtimeMs)}</div>
				<div class="stat__sub mono">{downtimeSub}</div>
				<div class="stat__opts">
					{#each [['month', m.dt_month()], ['year', m.dt_year()], ['all', m.dt_all()]] as const as [value, label] (value)}
						<button class="dtchip" class:dtchip--on={downtimeRange === value} onclick={() => (downtimeRange = value)}>{label}</button>
					{/each}
				</div>
			</div>
			<div class="stat">
				<div class="stat__label">{m.stat_last()}</div>
				<div class="stat__value mono" style:color="#8ec8ff">{latest ? relative(latest.start) : '—'}</div>
				<div class="stat__sub mono">{latest ? sevMeta[latest.sev].label : '—'}</div>
			</div>
		</div>

		<div class="toolbar">
			<div class="filters">
				<button class="chip" class:chip--on={filter === 'all'} onclick={() => (filter = 'all')}>
					{m.filter_all()} · {counts.all}
				</button>
				{#each SEVERITIES as sev (sev)}
					<button class="chip" class:chip--on={filter === sev} onclick={() => (filter = sev)}>
						{sevMeta[sev].label} · {counts[sev]}
					</button>
				{/each}
				<button class="chip" class:chip--on={filter === 'acknowledged'} onclick={() => (filter = 'acknowledged')}>
					{m.filter_acknowledged()} · {counts.acknowledged}
				</button>
			</div>
			{#if open.length}
				<form method="POST" action="?/ackAll" use:enhance class="ackall">
					<button class="btn" type="submit">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M20 6L9 17l-5-5" />
						</svg>{m.acknowledge_all()}
					</button>
				</form>
			{/if}
		</div>

		{#each groups as group (group.key)}
			<div class="daylabel">
				<span class="daylabel__text">{group.label}</span>
				<span class="daylabel__rule"></span>
				<span class="hint">{group.count}</span>
			</div>
			<div class="alertlist">
				{#each group.items as alert (alert.id)}
					{@const meta = sevMeta[alert.sev]}
					{@const acked = isAcked(alert)}
					<div class="alert" class:alert--acked={acked}>
						<button class="alert__main" onclick={() => inspect(alert)}>
							<span class="alert__icon" style:background={meta.bg}>
								<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={meta.color} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
									{#if alert.kind === 'outage'}
										<path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
									{:else if alert.kind === 'sustained'}
										<path d="M12 4v13" /><path d="M6 11l6 6 6-6" />
									{:else if alert.kind === 'loss'}
										<path d="M3 12h3l2.5 6 5-14 2.5 8h5" />
									{:else}
										<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" /><path d="M12 7.5V12l3 2" />
									{/if}
								</svg>
							</span>
							<span class="alert__body">
								<span class="alert__titlerow">
									<span class="alert__title">{titles[alert.kind]}</span>
									<span class="alert__pill" style:background={meta.bg} style:color={meta.color}>{meta.label}</span>
									{#if acked}<span class="alert__ackd mono">✓ {m.acknowledged()}</span>{/if}
								</span>
								<span class="alert__detail">{detail(alert)}</span>
							</span>
							<span class="alert__time">
								<span class="mono">{fmtClock(alert.start)}</span>
								<span class="mono alert__dur">· {fmtDur(alert.dur)}</span>
							</span>
						</button>
						<form method="POST" action="?/toggleAck" use:enhance>
							<input type="hidden" name="id" value={alert.id} />
							<button class="btn alert__ack" type="submit">{acked ? m.undo() : m.acknowledge()}</button>
						</form>
					</div>
				{/each}
			</div>
		{/each}

		{#if !shown.length}
			<div class="emptystate">
				<div class="emptystate__icon">
					<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--download)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 6L9 17l-5-5" />
					</svg>
				</div>
				<div class="emptystate__title">{m.no_alerts_view()}</div>
				<div class="emptystate__hint">{emptyHint}</div>
			</div>
		{/if}
	</div>
</div>
