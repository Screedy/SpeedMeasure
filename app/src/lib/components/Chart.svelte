<script lang="ts">
	import '../../styles/chart.css';
	import type { Bucket } from '$lib/server/data';
	import { COLORS, SERIES, fmtAxis, fmtTime, niceMax, num, type SeriesKey } from '$lib/format';
	import { m } from '$lib/paraglide/messages';

	let {
		buckets,
		from,
		to,
		enabled,
		pins = [],
		mark = null,
		onzoom
	}: {
		buckets: Bucket[];
		from: number;
		to: number;
		enabled: Record<SeriesKey, boolean>;
		pins?: number[];
		mark?: number | null;
		onzoom: (from: number, to: number) => void;
	} = $props();

	const VBW = 1240;
	const VBH = 440;
	const PAD = { l: 64, r: 54, t: 16, b: 42 };
	const plotW = VBW - PAD.l - PAD.r;
	const plotH = VBH - PAD.t - PAD.b;
	const ROWS = 5;
	/** Minimum drag in viewBox units before we treat it as a zoom rather than a click. */
	const DRAG_THRESHOLD = 8;

	let svg = $state<SVGSVGElement>();
	let hover = $state<number | null>(null);
	let brush = $state<{ x0: number; x1: number } | null>(null);

	const n = $derived(buckets.length);
	const span = $derived(Math.max(1, to - from));
	const rightAxis = $derived(enabled.ping || enabled.jitter);

	/** Every x position is proportional to real elapsed time, never to array index —
	    sparse or bursty data (a lone test hours ago, then a cluster just now) must not
	    get stretched into evenly-spaced dots, or a drag-to-zoom over them would compute
	    a time range that misses the actual points entirely. */
	const xt = (t: number) => PAD.l + ((t - from) / span) * plotW;

	const scale = $derived.by(() => {
		let left = 0;
		let right = 0;
		let loss = 0;
		for (const b of buckets) {
			if (enabled.download) left = Math.max(left, b.download);
			if (enabled.upload) left = Math.max(left, b.upload);
			if (enabled.ping) right = Math.max(right, b.ping);
			if (enabled.jitter) right = Math.max(right, b.jitter);
			loss = Math.max(loss, b.loss);
		}
		return {
			left: niceMax(left * 1.04 || 100),
			right: niceMax(right * 1.08 || 20),
			loss: niceMax(loss || 1)
		};
	});

	const yL = (v: number) => PAD.t + plotH * (1 - v / scale.left);
	const yR = (v: number) => PAD.t + plotH * (1 - v / scale.right);
	const yFor = (key: SeriesKey) => (key === 'ping' || key === 'jitter' ? yR : yL);

	const line = (key: SeriesKey) => {
		const y = yFor(key);
		return `M${buckets.map((b) => `${xt(b.t).toFixed(1)} ${y(b[key]).toFixed(1)}`).join('L')}`;
	};
	const area = (key: SeriesKey) => {
		const y = yFor(key);
		const base = (PAD.t + plotH).toFixed(1);
		const coords = buckets.map((b) => `${xt(b.t).toFixed(1)} ${y(b[key]).toFixed(1)}`).join('L');
		return `M${xt(buckets[0].t).toFixed(1)} ${base}L${coords}L${xt(buckets[n - 1].t).toFixed(1)} ${base}Z`;
	};

	const gridRows = $derived(
		Array.from({ length: ROWS + 1 }, (_, i) => ({
			y: PAD.t + (i / ROWS) * plotH,
			left: Math.round(scale.left * (1 - i / ROWS)).toString(),
			right: (scale.right * (1 - i / ROWS)).toFixed(scale.right < 10 ? 1 : 0),
			last: i === ROWS
		}))
	);

	// Pick ~7 representative buckets, evenly spaced by index (a simple way to thin out
	// up to 180 points to a readable number of labels), but place each at its real time.
	const xTicks = $derived.by(() => {
		const count = Math.min(7, n);

		if (count < 2) return n === 1 ? [{ x: xt(buckets[0].t), idx: 0, label: fmtAxis(buckets[0].t, span) }] : [];
		
		return Array.from({ length: count }, (_, i) => {
			const idx = Math.round((i / (count - 1)) * (n - 1));

			return { x: xt(buckets[idx].t), idx, label: fmtAxis(buckets[idx].t, span) };
		});
	});

	// The filled area wash always belongs to whichever throughput series is visible —
	// download when shown, falling back to upload so the chart doesn't go flat and
	// colorless just because download got toggled off.
	const primaryKey: SeriesKey | null = $derived(
		enabled.download ? 'download' : enabled.upload ? 'upload' : null
	);

	const lossBarWidth = $derived(Math.max(2, (plotW / Math.max(1, n)) * 0.6));
	const hovered = $derived(hover !== null && hover >= 0 && hover < n ? buckets[hover] : null);

	const labels: Record<SeriesKey, string> = {
		download: m.series_download(),
		upload: m.series_upload(),
		ping: m.series_ping(),
		jitter: m.series_jitter(),
		loss: m.series_loss()
	};

	// --- pointer -------------------------------------------------------------

	/** Client x -> viewBox x, so the maths is resolution-independent. */
	function viewBoxX(event: PointerEvent) {
		const rect = svg!.getBoundingClientRect();

		return ((event.clientX - rect.left) / rect.width) * VBW;
	}

	/** Nearest bucket to a pointer position, by actual time — points are not evenly
	    spaced by index, so this can't be a simple fraction-of-width calculation. */
	function indexFromX(x: number) {
		if (n <= 1) return 0;

		const target = from + ((x - PAD.l) / plotW) * span;
		let best = 0;
		let bestDist = Infinity;

		for (let i = 0; i < n; i++) {
			const dist = Math.abs(buckets[i].t - target);
			
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		}
		return best;
	}

	function onmove(event: PointerEvent) {
		const x = viewBoxX(event);
		if (brush) brush = { ...brush, x1: x };
		else hover = indexFromX(x);
	}

	function ondown(event: PointerEvent) {
		brush = { x0: viewBoxX(event), x1: viewBoxX(event) };
		hover = null;
		// Keep receiving pointermove/pointerup for this drag even once the cursor strays
		// outside the (fairly narrow) capture rect — a long horizontal drag easily drifts
		// a few pixels vertically, and without capture that would silently drop the drag.
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	}

	function onup() {
		if (!brush) return;
		if (Math.abs(brush.x1 - brush.x0) > DRAG_THRESHOLD) {
			const f0 = Math.min(1, Math.max(0, (Math.min(brush.x0, brush.x1) - PAD.l) / plotW));
			const f1 = Math.min(1, Math.max(0, (Math.max(brush.x0, brush.x1) - PAD.l) / plotW));
			onzoom(from + f0 * span, from + f1 * span);
		}
		brush = null;
	}

	/** Only clears the hover readout — an in-progress drag is tracked via pointer
	    capture and must only end on pointerup, never on the cursor merely leaving. */
	function onleave() {
		hover = null;
	}

	const hoveredX = $derived(hovered ? xt(hovered.t) : 0);
	const tooltipPct = $derived(hovered ? (hoveredX / VBW) * 100 : 0);
	const tooltipFlip = $derived(tooltipPct > 62);
</script>

<div class="chart">
	<svg
		bind:this={svg}
		viewBox="0 0 {VBW} {VBH}"
		width="100%"
		preserveAspectRatio="none"
		role="img"
		aria-label={m.speed_over_time()}
	>
		{#each gridRows as row, i (i)}
			<line x1={PAD.l} x2={PAD.l + plotW} y1={row.y} y2={row.y} stroke={row.last ? 'var(--border-3)' : '#1a2029'} stroke-width="1" />
			<text x={PAD.l - 9} y={row.y + 3.5} text-anchor="end" class="tick">{row.left}</text>
			{#if rightAxis}
				<text x={PAD.l + plotW + 9} y={row.y + 3.5} text-anchor="start" class="tick">{row.right}</text>
			{/if}
		{/each}

		<text x={PAD.l - 9} y={PAD.t - 10} text-anchor="end" class="axis-unit">Mbps</text>
		{#if rightAxis}
			<text x={PAD.l + plotW + 9} y={PAD.t - 10} text-anchor="start" class="axis-unit">ms</text>
		{/if}

		{#each xTicks as tick, i (i)}
			<line x1={tick.x} x2={tick.x} y1={PAD.t + plotH} y2={PAD.t + plotH + 4} stroke="var(--border-3)" stroke-width="1" />
			<text x={tick.x} y={PAD.t + plotH + 18} text-anchor="middle" class="tick">{tick.label}</text>
		{/each}

		{#if enabled.loss}
			{#each buckets as b (b.t)}
				{#if b.loss > 0.01}
					{@const h = (b.loss / scale.loss) * (plotH * 0.3)}
					<rect x={xt(b.t) - lossBarWidth / 2} y={PAD.t + plotH - h} width={lossBarWidth} height={h} fill={COLORS.loss} opacity="0.5" rx="1" />
				{/if}
			{/each}
		{/if}

		{#if n > 0}
			{#if primaryKey}
				<path d={area(primaryKey)} fill={COLORS[primaryKey]} opacity="0.08" />
			{/if}
			{#if enabled.download}
				<path d={line('download')} fill="none" stroke={COLORS.download} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
			{/if}
			{#if enabled.upload}
				<path
					d={line('upload')}
					fill="none"
					stroke={COLORS.upload}
					stroke-width={primaryKey === 'upload' ? '1.8' : '1.6'}
					stroke-linejoin="round"
					stroke-linecap={primaryKey === 'upload' ? 'round' : undefined}
				/>
			{/if}
			{#if enabled.ping}
				<path d={line('ping')} fill="none" stroke={COLORS.ping} stroke-width="1.5" stroke-linejoin="round" opacity="0.95" />
			{/if}
			{#if enabled.jitter}
				<path d={line('jitter')} fill="none" stroke={COLORS.jitter} stroke-width="1.4" stroke-linejoin="round" opacity="0.9" />
			{/if}

			<!-- One dot per line series at each labelled x-axis mark, so the reader can read
			     an exact value off the axis without having to hover. -->
			{#each xTicks as tick (tick.idx)}
				{#each SERIES as s (s.key)}
					{#if enabled[s.key] && s.axis !== 'bars'}
						<circle cx={tick.x} cy={yFor(s.key)(buckets[tick.idx][s.key])} r="2.6" fill={COLORS[s.key]} />
					{/if}
				{/each}
			{/each}
		{/if}

		{#each pins.filter((p) => p >= from && p <= to) as pin (pin)}
			<line x1={xt(pin)} x2={xt(pin)} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--accent-2)" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.9" />
			<path d="M{(xt(pin) - 4).toFixed(1)} {PAD.t} L{(xt(pin) + 4).toFixed(1)} {PAD.t} L{xt(pin).toFixed(1)} {PAD.t + 7} Z" fill="var(--accent-2)" />
		{/each}

		{#if mark !== null && mark >= from && mark <= to && !pins.includes(mark)}
			<line x1={xt(mark)} x2={xt(mark)} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--fg-2)" stroke-width="1.1" stroke-dasharray="4 3" opacity="0.55" />
		{/if}

		{#if hovered}
			<line x1={hoveredX} x2={hoveredX} y1={PAD.t} y2={PAD.t + plotH} stroke="#404b59" stroke-width="1" />
			{#each SERIES as s (s.key)}
				{#if enabled[s.key] && s.axis !== 'bars'}
					<circle cx={hoveredX} cy={yFor(s.key)(hovered[s.key])} r="3.3" fill="var(--bg)" stroke={COLORS[s.key]} stroke-width="2" />
				{/if}
			{/each}
		{/if}

		{#if brush}
			{@const x = Math.min(brush.x0, brush.x1)}
			{@const w = Math.abs(brush.x1 - brush.x0)}
			<rect {x} y={PAD.t} width={w} height={plotH} fill="var(--accent-2)" opacity="0.12" />
			<line x1={x} x2={x} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--accent-2)" stroke-width="1" />
			<line x1={x + w} x2={x + w} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--accent-2)" stroke-width="1" />
		{/if}

		<!-- Transparent capture layer so pointer maths never depends on which mark is under the cursor. -->
		<rect
			class="capture"
		role="presentation"
			x={PAD.l}
			y={PAD.t}
			width={plotW}
			height={plotH}
			fill="transparent"
			onpointermove={onmove}
			onpointerdown={ondown}
			onpointerup={onup}
			onpointerleave={onleave}
		/>
	</svg>

	{#if hovered}
		<div
			class="tooltip"
			style:left={tooltipFlip ? 'auto' : `${tooltipPct}%`}
			style:right={tooltipFlip ? `${100 - tooltipPct}%` : 'auto'}
			style:transform={tooltipFlip ? 'translateX(-10px)' : 'translateX(10px)'}
		>
			<div class="tooltip__time">
				{fmtTime(hovered.t)}{hovered.count > 1 ? `  ·  ${m.tests_at_point({ count: hovered.count })}` : ''}
			</div>
			{#each SERIES as s (s.key)}
				{#if enabled[s.key]}
					<div class="tooltip__row">
						<span class="tooltip__dot" style:background={COLORS[s.key]}></span>
						<span class="tooltip__label">{labels[s.key]}</span>
						<span class="tooltip__value">{num(hovered[s.key], s.key)} {s.unit}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
