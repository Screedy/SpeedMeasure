import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';

/** Locale-aware duration. Shared/alerts.mjs keeps an English one for runner emails. */
export const fmtDur = (ms: number) => {
	const total = Math.round(ms / 60000);
	if (total < 1) return m.dur_under_min();
	if (total < 60) return m.dur_min({ count: total });
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	return minutes ? m.dur_hm({ hours, minutes }) : m.dur_h({ count: hours });
};

const fmt = (options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat(getLocale(), options);

export const fmtMonthDay = (t: number) => fmt({ month: 'short', day: 'numeric' }).format(t);
export const fmtWeekdayDate = (t: number) =>
	fmt({ weekday: 'long', month: 'short', day: 'numeric' }).format(t);
export const fmtMonth = (t: number) => fmt({ month: 'short' }).format(t);
export const fmtMonthYear = (t: number) => fmt({ month: 'short', year: '2-digit' }).format(t);

const pad = (n: number) => String(n).padStart(2, '0');

export const DAY = 864e5;
export const HOUR = 36e5;

export const fmtTime = (t: number) => {
	const d = new Date(t);
	return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtClock = (t: number) => {
	const d = new Date(t);
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Clock time for short windows, calendar date once the span exceeds a couple of days. */
export const fmtAxis = (t: number, span: number) => {
	const d = new Date(t);
	if (span < 2.2 * DAY) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	return fmtMonthDay(t);
};

/** Value formatting per metric — packet loss needs two decimals, throughput does not. */
export const num = (v: number, key: string) => {
	if (key === 'loss') return v.toFixed(2);
	if (key === 'ping' || key === 'jitter') return v.toFixed(1);
	return v >= 100 ? Math.round(v).toString() : v.toFixed(1);
};

const NICE_STEPS = [1, 1.1, 1.2, 1.25, 1.4, 1.5, 1.6, 1.75, 2, 2.25, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10];

/** Round an axis maximum up to a value that produces readable gridline labels. */
export const niceMax = (v: number) => {
	if (v <= 0) return 1;
	const exp = Math.floor(Math.log10(v));
	const frac = v / 10 ** exp;
	return (NICE_STEPS.find((x) => x >= frac - 1e-9) ?? 10) * 10 ** exp;
};

/** Epoch ms -> the local-time string an <input type="datetime-local"> expects. */
export const toLocalInput = (t: number) =>
	new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const SERIES = [
	{ key: 'download', unit: 'Mbps', axis: 'left' },
	{ key: 'upload', unit: 'Mbps', axis: 'left' },
	{ key: 'ping', unit: 'ms', axis: 'right' },
	{ key: 'jitter', unit: 'ms', axis: 'right' },
	{ key: 'loss', unit: '%', axis: 'bars' }
] as const;

export type SeriesKey = (typeof SERIES)[number]['key'];

export const COLORS: Record<SeriesKey, string> = {
	download: '#3fb950',
	upload: '#58a6ff',
	ping: '#d29922',
	jitter: '#bc8cff',
	loss: '#f85149'
};

/**
 * Tick positions for the navigator strip, chosen from the total history span so the
 * same component reads sensibly over a day or over five years.
 */
export function navTicks(t0: number, t1: number) {
	const span = t1 - t0;
	const out: { t: number; label: string }[] = [];

	if (span <= 2.5 * DAY) {
		const step = span <= 12 * HOUR ? 2 * HOUR : span <= DAY ? 4 * HOUR : 6 * HOUR;
		const start = new Date(t0);
		start.setMinutes(0, 0, 0);
		start.setHours(Math.ceil(start.getHours() / (step / HOUR)) * (step / HOUR));
		for (let t = start.getTime(); t < t1; t += step) {
			if (t < t0) continue;
			const d = new Date(t);
			out.push({ t, label: d.getHours() === 0 ? fmtMonthDay(t) : `${pad(d.getHours())}:00` });
		}
	} else if (span <= 45 * DAY) {
		const step = span <= 18 * DAY ? DAY : span <= 32 * DAY ? 2 * DAY : 3 * DAY;
		const start = new Date(t0);
		start.setHours(0, 0, 0, 0);
		for (let t = start.getTime() + step; t < t1; t += step) {
			if (t < t0) continue;
			out.push({ t, label: fmtMonthDay(t) });
		}
	} else if (span <= 120 * DAY) {
		const monday = new Date(t0);
		monday.setHours(0, 0, 0, 0);
		monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
		for (let t = monday.getTime(); t < t1; t += 7 * DAY) out.push({ t, label: fmtMonthDay(t) });
	} else if (span <= 330 * DAY) {
		const d = new Date(t0);
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		d.setMonth(d.getMonth() + 1);
		for (; d.getTime() < t1; d.setMonth(d.getMonth() + 1)) out.push({ t: d.getTime(), label: fmtMonth(d.getTime()) });
	} else {
		const d = new Date(t0);
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		const stepMonths = span <= 800 * DAY ? 2 : 3;
		d.setMonth(Math.ceil((d.getMonth() + 1) / stepMonths) * stepMonths);
		for (; d.getTime() < t1; d.setMonth(d.getMonth() + stepMonths)) {
			out.push({
				t: d.getTime(),
				label: d.getMonth() === 0 ? String(d.getFullYear()) : fmtMonthYear(d.getTime())
			});
		}
	}
	return out;
}
