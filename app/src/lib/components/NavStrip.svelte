<script lang="ts">
	import '../../styles/chart.css';
	import { COLORS, navTicks, niceMax } from '$lib/format';

	let {
		series,
		start,
		end,
		from,
		to,
		onselect
	}: {
		series: { t: number; download: number }[];
		start: number;
		end: number;
		from: number;
		to: number;
		onselect: (from: number, to: number) => void;
	} = $props();

	const W = 1240;
	const H = 58;
	const PAD = { x: 2, t: 5, b: 17 };
	const plotW = W - 2 * PAD.x;
	const plotH = H - PAD.t - PAD.b;
	const DRAG_THRESHOLD = 6;

	let svg = $state<SVGSVGElement>();
	let brush = $state<{ x0: number; x1: number } | null>(null);

	const span = $derived(Math.max(1, end - start));
	const maxDown = $derived(niceMax(Math.max(...series.map((p) => p.download), 0) * 1.02 || 100));

	const x = (t: number) => PAD.x + ((t - start) / span) * plotW;
	const y = (v: number) => PAD.t + plotH * (1 - v / maxDown);

	const paths = $derived.by(() => {
		if (!series.length) return null;
		const coords = series.map((p) => `${x(p.t).toFixed(1)} ${y(p.download).toFixed(1)}`);
		const base = (PAD.t + plotH).toFixed(1);
		return {
			line: `M${coords.join('L')}`,
			area: `M${x(series[0].t).toFixed(1)} ${base}L${coords.join('L')}L${x(series.at(-1)!.t).toFixed(1)} ${base}Z`
		};
	});

	const ticks = $derived(navTicks(start, end));
	// Clamped to the plot bounds: a selected window can legitimately extend past the
	// domain (e.g. typed into the date inputs), and an unclamped handle would render
	// off-canvas, collapsing the visible selection to a single sliver at one edge.
	const windowX0 = $derived(Math.min(PAD.x + plotW, Math.max(PAD.x, x(from))));
	const windowX1 = $derived(Math.min(PAD.x + plotW, Math.max(PAD.x, x(to))));

	function viewBoxX(event: PointerEvent) {
		const rect = svg!.getBoundingClientRect();
		return ((event.clientX - rect.left) / rect.width) * W;
	}
	const timeAt = (px: number) => start + ((px - PAD.x) / plotW) * span;

	function ondown(event: PointerEvent) {
		brush = { x0: viewBoxX(event), x1: viewBoxX(event) };
		// Keep receiving pointermove/pointerup for this drag even once the cursor strays
		// outside the (fairly narrow) capture rect — a long horizontal drag easily drifts
		// a few pixels vertically, and without capture that would silently drop the drag.
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	}
	function onmove(event: PointerEvent) {
		if (brush) brush = { ...brush, x1: viewBoxX(event) };
	}
	function onup() {
		if (brush && Math.abs(brush.x1 - brush.x0) > DRAG_THRESHOLD) {
			const t0 = Math.max(start, timeAt(Math.min(brush.x0, brush.x1)));
			const t1 = Math.min(end, timeAt(Math.max(brush.x0, brush.x1)));
			onselect(t0, t1);
		}
		brush = null;
	}
</script>

<svg
	class="navstrip"
	bind:this={svg}
	viewBox="0 0 {W} {H}"
	width="100%"
	preserveAspectRatio="none"
	role="img"
	aria-label="History navigator"
>
	{#if paths}
		<path d={paths.area} fill={COLORS.download} opacity="0.1" />
		<path d={paths.line} fill="none" stroke={COLORS.download} stroke-width="1" opacity="0.55" />
	{/if}

	<!-- Dim everything outside the selected window rather than drawing a highlight over it. -->
	<rect x="0" y="0" width={Math.max(0, windowX0)} height={PAD.t + plotH} fill="var(--bg)" opacity="0.62" />
	<rect x={windowX1} y="0" width={Math.max(0, W - windowX1)} height={PAD.t + plotH} fill="var(--bg)" opacity="0.62" />

	<rect
		x={windowX0}
		y={PAD.t - 3}
		width={Math.max(2, windowX1 - windowX0)}
		height={plotH + 6}
		fill="var(--accent-2)"
		opacity="0.09"
		stroke="var(--accent-2)"
		stroke-width="1.3"
		rx="3"
	/>
	{#each [windowX0, windowX1] as handle, i (i)}
		<rect x={handle - 1.4} y={PAD.t + plotH / 2 - 7} width="2.8" height="14" rx="1.4" fill="var(--accent-2)" />
	{/each}

	{#each ticks as tick (tick.t)}
		<line x1={x(tick.t)} x2={x(tick.t)} y1={PAD.t} y2={PAD.t + plotH} stroke="#1a2029" stroke-width="1" />
		<text x={x(tick.t) + 3} y={H - 5} class="tick tick--sm">{tick.label}</text>
	{/each}

	{#if brush}
		<rect
			x={Math.min(brush.x0, brush.x1)}
			y={PAD.t - 3}
			width={Math.abs(brush.x1 - brush.x0)}
			height={plotH + 6}
			fill="var(--accent-2)"
			opacity="0.16"
			stroke="var(--accent-2)"
			stroke-width="1"
			rx="3"
		/>
	{/if}

	<rect
		class="capture"
		role="presentation"
		x="0"
		y="0"
		width={W}
		height={PAD.t + plotH}
		fill="transparent"
		onpointerdown={ondown}
		onpointermove={onmove}
		onpointerup={onup}
	/>
</svg>
