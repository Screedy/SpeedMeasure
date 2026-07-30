<script lang="ts">
	let { values, color }: { values: number[]; color: string } = $props();

	const W = 130;
	const H = 32;
	const PAD = 3;
	const MAX_POINTS = 60;

	const paths = $derived.by(() => {
		if (!values.length) return null;

		const min = Math.min(...values);
		const range = Math.max(...values) - min || 1;

		// Thin out dense series — a 130px sparkline cannot show more than ~60 points.
		const step = values.length > MAX_POINTS ? Math.ceil(values.length / MAX_POINTS) : 1;
		const pts: number[] = [];
		if (step === 1) {
			pts.push(...values);
		} else { // picking min/max in each step preserves the shape of the series better than just picking every Nth point
			for (let i = 0; i < values.length; i += step) {
				const chunk = values.slice(i, i + step);
				const lo = Math.min(...chunk);
				const hi = Math.max(...chunk);
				if (chunk.indexOf(lo) <= chunk.indexOf(hi)) pts.push(lo, hi);
				else pts.push(hi, lo);
			}
		}
		if (pts.at(-1) !== values.at(-1)) pts.push(values.at(-1)!);

		const x = (i: number) => PAD + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * (W - 2 * PAD));
		const y = (v: number) => PAD + (1 - (v - min) / range) * (H - 2 * PAD);

		const coords = pts.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
		return {
			line: `M${coords.join('L')}`,
			area: `M${x(0).toFixed(1)} ${H}L${coords.join('L')}L${x(pts.length - 1).toFixed(1)} ${H}Z`
		};
	});
</script>

{#if paths}
	<svg width="100%" height={H} viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
		<path d={paths.area} fill={color} opacity="0.1" />
		<path d={paths.line} fill="none" stroke={color} stroke-width="1.6" stroke-linejoin="round" />
	</svg>
{/if}
