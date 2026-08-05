<script lang="ts">
	import '../../styles/chart.css';
	import { niceMax } from '$lib/format';

	let {
		samples,
		duration,
		linkMbps,
		color
	}: {
		samples: { t: number; mbps: number }[];
		duration: number;
		linkMbps: number | null;
		color: string;
	} = $props();

	const VBW = 1000;
	const VBH = 260;
	const PAD = { l: 54, r: 16, t: 16, b: 28 };
	const plotW = VBW - PAD.l - PAD.r;
	const plotH = VBH - PAD.t - PAD.b;
	const ROWS = 4;

	const maxSample = $derived(samples.reduce((m, s) => Math.max(m, s.mbps), 0));
	const maxY = $derived(niceMax(Math.max(maxSample, linkMbps ?? 0) * 1.06 || 100));
	const giga = $derived(maxY >= 1000);
	const fmtY = (v: number) => (giga ? (v / 1000).toFixed(1) : Math.round(v).toString());

	const y = (v: number) => PAD.t + plotH * (1 - v / maxY);
	const x = (sec: number) => PAD.l + ((sec - 0.5) / duration) * plotW;

	const gridRows = $derived(
		Array.from({ length: ROWS + 1 }, (_, i) => ({
			y: PAD.t + (i / ROWS) * plotH,
			label: fmtY(maxY * (1 - i / ROWS)),
			last: i === ROWS
		}))
	);

	const xStep = $derived(duration <= 15 ? 1 : duration <= 30 ? 5 : 10);
	const xTicks = $derived.by(() => {
		const ticks = [];
		for (let s = 0; s <= duration; s += xStep) ticks.push(s);
		return ticks;
	});

	const barW = $derived(Math.max(3, (plotW / Math.max(1, duration)) * 0.66));
	const linkY = $derived(linkMbps ? y(linkMbps) : null);

	const linePath = $derived(
		samples.length > 1 ? `M${samples.map((s) => `${x(s.t).toFixed(1)} ${y(s.mbps).toFixed(1)}`).join('L')}` : ''
	);
</script>

<div class="chart">
	<svg viewBox="0 0 {VBW} {VBH}" width="100%" preserveAspectRatio="none" role="img" aria-label="Throughput over time">
		{#each gridRows as row, i (i)}
			<line x1={PAD.l} x2={PAD.l + plotW} y1={row.y} y2={row.y} stroke={row.last ? 'var(--border-3)' : '#1a2029'} stroke-width="1" />
			<text x={PAD.l - 9} y={row.y + 3.5} text-anchor="end" class="tick">{row.label}</text>
		{/each}
		<text x={PAD.l - 9} y={PAD.t - 5} text-anchor="end" class="axis-unit">{giga ? 'Gb/s' : 'Mb/s'}</text>

		{#if linkY !== null}
			<line x1={PAD.l} x2={PAD.l + plotW} y1={linkY} y2={linkY} stroke="var(--border-4)" stroke-width="1" stroke-dasharray="5 4" />
			<text x={PAD.l + plotW} y={linkY - 5} text-anchor="end" class="tick tick--sm">link capacity</text>
		{/if}

		{#each xTicks as sec (sec)}
			<text x={PAD.l + (sec / duration) * plotW} y={PAD.t + plotH + 18} text-anchor="middle" class="tick">{sec}s</text>
		{/each}

		{#each samples as s (s.t)}
			<rect
				x={x(s.t) - barW / 2}
				y={y(s.mbps)}
				width={barW}
				height={Math.max(0, PAD.t + plotH - y(s.mbps))}
				fill={color}
				opacity="0.85"
				rx="2"
			/>
		{/each}
		{#if linePath}
			<path d={linePath} fill="none" stroke={color} stroke-width="1.5" opacity="0.9" />
		{/if}
	</svg>
</div>
