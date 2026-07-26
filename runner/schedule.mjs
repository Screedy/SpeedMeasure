const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/**
 * How long to wait before the next test.
 *
 * @param settings  DEFAULT_SETTINGS-shaped
 * @param breaching whether the latest sample is below the guaranteed floor
 * @param now       current time (injected so this is testable)
 */
export function nextDelayMs(settings, breaching, now) {
	// Adaptive ramp-up overrides both modes: while speeds are down we sample tightly
	// enough to prove a sustained breach, then fall back to the normal cadence.
	if (settings.adaptive && breaching) {
		return Math.max(1, Number(settings.adaptiveInterval) || 5) * MIN;
	}

	if (settings.sched === 'daily') {
		const [h, m] = String(settings.time || '03:00')
			.split(':')
			.map(Number);
		const next = new Date(now);
		next.setHours(h || 0, m || 0, 0, 0);
		// Already past today's slot — aim at tomorrow's.
		if (next <= now) next.setTime(next.getTime() + DAY);
		return next.getTime() - now.getTime();
	}

	// Aligned to a repeating anchor + N*interval grid (e.g. 11:00, 11:30, 12:00 for a
	// 30-min interval anchored at 11:00), not "N minutes after whenever the last cycle
	// happened to finish" — the latter compounds every cycle's own runtime into visible
	// drift over hours (a 90s test turns "every 30 min" into 31.5-min gaps, then 33, ...).
	const intervalMs = Math.max(1, Number(settings.interval) || 30) * MIN;
	const [ah, am] = String(settings.time || '03:00')
		.split(':')
		.map(Number);
	const anchor = new Date(now);
	anchor.setHours(ah || 0, am || 0, 0, 0);
	const stepsPassed = Math.floor((now.getTime() - anchor.getTime()) / intervalMs);
	const next = anchor.getTime() + (stepsPassed + 1) * intervalMs;
	return next - now.getTime();
}

// Runnable self-check: `node schedule.mjs`
if (import.meta.filename === process.argv[1]) {
	const { strictEqual: eq } = await import('node:assert');
	const at = (s) => new Date(`2026-07-18T${s}Z`);

	eq(nextDelayMs({ sched: 'interval', interval: 30 }, false, at('10:00:00')), 30 * MIN);
	eq(nextDelayMs({ sched: 'interval', interval: 0 }, false, at('10:00:00')), 30 * MIN, 'bad interval falls back');

	// Interval mode is aligned to a repeating anchor grid, not "N minutes from whenever
	// this cycle happened to start" — a run kicked off mid-cycle still lands on the next
	// grid point instead of pushing every future run later by the same slop.
	eq(
		nextDelayMs({ sched: 'interval', interval: 30, time: '00:00' }, false, at('10:07:00')),
		23 * MIN,
		'lands on the next :00/:30 boundary, not 30 min after 10:07'
	);
	eq(
		nextDelayMs({ sched: 'interval', interval: 30, time: '11:15' }, false, at('10:07:00')),
		8 * MIN,
		'a custom start time shifts the grid’s phase (…9:45, 10:15, 10:45…)'
	);
	eq(
		nextDelayMs({ sched: 'interval', interval: 45, time: '11:15' }, false, at('12:00:00')),
		45 * MIN,
		'exactly on a grid point still aims at the next one, not 0 or a re-fire'
	);
	eq(
		nextDelayMs({ adaptive: true, adaptiveInterval: 5, interval: 30 }, true, at('10:00:00')),
		5 * MIN,
		'breach tightens the cadence'
	);
	eq(
		nextDelayMs({ adaptive: false, adaptiveInterval: 5, interval: 30 }, true, at('10:00:00')),
		30 * MIN,
		'adaptive off ignores the breach'
	);

	// Daily mode is local-time, so assert on the wall clock rather than a fixed offset.
	const target = new Date(at('10:00:00').getTime() + nextDelayMs({ sched: 'daily', time: '03:00' }, false, at('10:00:00')));
	eq(target.getHours(), 3);
	eq(target.getMinutes(), 0);
	eq(target > at('10:00:00'), true, 'daily always points forward');

	console.log('schedule.mjs ok');
}
