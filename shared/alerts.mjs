// Shared by the web app (displays alerts) and the runner (emails them).
// Copied into both images by their Dockerfiles.

/** Every tunable the UI exposes, with the defaults a fresh install starts on. */
export const DEFAULT_SETTINGS = {
	// schedule
	sched: 'interval', // 'interval' | 'daily'
	interval: 30, // minutes
	time: '03:00', // when sched === 'daily'
	adaptive: false, // tighten the interval while a breach is active
	adaptiveInterval: 5, // minutes
	provider: 'ookla',
	iperfServer: '', // host or host:port — only used when provider === 'iperf3'
	// smtp
	smtpEnabled: false,
	smtpHost: '',
	smtpPort: 587,
	smtpSec: 'starttls', // 'none' | 'starttls' | 'ssltls'
	smtpUser: '',
	smtpPass: '',
	smtpFrom: '',
	// plan + thresholds
	planDown: 940,
	planUp: 50,
	gThreshold: 60, // % of advertised = guaranteed speed
	gMinThreshold: 30, // % of advertised = large drop, alerts immediately
	gMaxDrop: 70 // minutes a guaranteed-speed breach must persist before alerting
};

const MIN = 60_000;

/** Gap longer than this starts a new episode rather than extending the current one. */
const EPISODE_GAP_MS = 41 * MIN;
const LOSS_ALERT_PCT = 4;
const PING_ALERT_MS = 55;

export const fmtDur = (ms) => {
	const m = Math.round(ms / MIN);
	if (m < 1) return '<1 min';
	if (m < 60) return `${m} min`;

	const h = Math.floor(m / 60);
	const r = m % 60;
	return r ? `${h}h ${r}m` : `${h}h`;
};

/**
 * Group consecutive points matching `pred` into episodes, tolerating gaps up to
 * EPISODE_GAP_MS (so one recovered sample mid-outage doesn't split the incident).
 */
function scan(points, pred) {
	const episodes = [];
	let cur = null;

	for (const p of points) {
		if (!pred(p)) continue; // skip non-matching points
		
		// Extend the current episode if this point is close enough to the last one.
		if (cur && p.t - cur.end <= EPISODE_GAP_MS) {
			cur.end = p.t;
			cur.points.push(p);
		} else {
			if (cur) episodes.push(cur);
			cur = { start: p.t, end: p.t, points: [p] };
		}
	}
	if (cur) episodes.push(cur);
	return episodes;
}

/**
 * Derive alerts from raw measurements.
 * @param points ascending by `t` (epoch ms), each {t, download, upload, ping, jitter, loss}
 * @param settings a DEFAULT_SETTINGS-shaped object
 */
export function computeAlerts(points, settings) {
	const s = { ...DEFAULT_SETTINGS, ...settings };
	const gDown = (s.planDown * s.gThreshold) / 100;
	const gUp = (s.planUp * s.gThreshold) / 100;
	const minDown = (s.planDown * s.gMinThreshold) / 100;
	const minUp = (s.planUp * s.gMinThreshold) / 100;
	const sustainedMs = s.gMaxDrop * MIN;

	const alerts = [];
	const speedRanges = [];

	for (const ep of scan(points, (p) => p.download < gDown || p.upload < gUp)) {
		const dur = ep.end - ep.start;
		const worst = ep.points.reduce((a, b) => (b.download < a.download ? b : a));
		const severe = ep.points.some((p) => p.download < minDown || p.upload < minUp);
		// A shallow dip that recovers quickly is noise, not an incident.
		if (!severe && dur < sustainedMs) continue;
		speedRanges.push([ep.start, ep.end]);

		const downBreach = worst.download < gDown;
		const upBreach = ep.points.some((p) => p.upload < gUp);
		const metric = downBreach && upBreach ? 'both' : downBreach ? 'download' : 'upload';

		alerts.push({
			kind: severe ? 'outage' : 'sustained',
			sev: severe ? 'critical' : 'warning',
			metric,
			start: ep.start,
			end: ep.end,
			dur,
			worst: worst.t,
			// Numbers only — every consumer renders these in its own language.
			params: severe
				? { value: Math.round(worst.download), floor: Math.round(minDown) }
				: { floor: Math.round(gDown) }
		});
	}

	// Loss and latency spikes during an outage are the same incident — don't double-report.
	const duringOutage = (t) =>
		speedRanges.some(([a, b]) => t >= a - EPISODE_GAP_MS && t <= b + EPISODE_GAP_MS);

	for (const ep of scan(points, (p) => p.loss >= LOSS_ALERT_PCT)) {
		if (duringOutage(ep.start)) continue;
		const w = ep.points.reduce((a, b) => (b.loss > a.loss ? b : a));
		alerts.push({
			kind: 'loss',
			sev: 'warning',
			metric: 'loss',
			start: ep.start,
			end: ep.end,
			dur: ep.end - ep.start,
			worst: w.t,
			params: { value: +w.loss.toFixed(1) }
		});
	}

	for (const ep of scan(points, (p) => p.ping >= PING_ALERT_MS)) {
		if (duringOutage(ep.start)) continue;
		const w = ep.points.reduce((a, b) => (b.ping > a.ping ? b : a));
		alerts.push({
			kind: 'latency',
			sev: 'info',
			metric: 'ping',
			start: ep.start,
			end: ep.end,
			dur: ep.end - ep.start,
			worst: w.t,
			params: { value: Math.round(w.ping) }
		});
	}

	for (const a of alerts) a.id = `${a.kind}-${a.start}`;
	return alerts.sort((a, b) => b.start - a.start);
}

/** True when the most recent sample is below the guaranteed floor (drives adaptive ramp-up). */
export function inBreach(latest, settings) {
	if (!latest) return false;
	const s = { ...DEFAULT_SETTINGS, ...settings };
	return (
		latest.download < (s.planDown * s.gThreshold) / 100 ||
		latest.upload < (s.planUp * s.gThreshold) / 100
	);
}
