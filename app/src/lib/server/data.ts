import type { Point } from '$shared/alerts.mjs';
import { sql } from './db';

export interface Bucket extends Point {
	/** How many raw tests this point averages. 1 means full resolution. */
	count: number;
}

export interface Row extends Point {
	provider: string;
	server: string;
	invalid: boolean;
}

/** Columns the table may be sorted by. Whitelisted — these are interpolated as identifiers. */
const SORTABLE = {
	t: 'time',
	server: 'server',
	download: 'download_mbps',
	upload: 'upload_mbps',
	ping: 'ping_ms',
	jitter: 'jitter_ms'
} as const;

export type SortKey = keyof typeof SORTABLE;
export const isSortKey = (k: string): k is SortKey => k in SORTABLE;

const TARGET_POINTS = 180;
const MINUTE = 60_000;

const toPoint = (r: Record<string, unknown>) => ({
	t: (r.t as Date).getTime(),
	download: Number(r.download ?? 0),
	upload: Number(r.upload ?? 0),
	ping: Number(r.ping ?? 0),
	jitter: Number(r.jitter ?? 0),
	loss: Number(r.loss ?? 0)
});

/**
 * Downsample a time range to ~TARGET_POINTS in the database rather than shipping every
 * raw row to the browser.
 */
export async function loadBuckets(from: Date, to: Date): Promise<Bucket[]> {
	const span = Math.max(MINUTE, +to - +from);
	const bucketMs = Math.max(MINUTE, Math.round(span / TARGET_POINTS));

	// date_bin() only groups — its return value is the bin's left edge, not a real
	// timestamp. A bucket with a single test would otherwise display it up to
	// bucketMs early, visibly detached from where that test's row/pin actually sits.
	const rows = await sql`
		SELECT to_timestamp(avg(extract(epoch from time))) AS t,
		       avg(download_mbps) AS download,
		       avg(upload_mbps)   AS upload,
		       avg(ping_ms)       AS ping,
		       avg(jitter_ms)     AS jitter,
		       avg(loss_pct)      AS loss,
		       count(*)::int      AS count
		FROM measurement
		WHERE time >= ${from} AND time <= ${to} AND NOT invalid
		GROUP BY date_bin(${`${bucketMs} milliseconds`}::interval, time, 'epoch'::timestamptz)
		ORDER BY 1`;

	return rows.map((r) => ({ ...toPoint(r), count: r.count }));
}

/**
 * The single most recent raw measurement in the range — the stat cards' headline number
 * must always be an actual test result.
 */
export async function loadLatest(from: Date, to: Date): Promise<Point | null> {
	const [row] = await sql`
		SELECT time AS t, download_mbps AS download, upload_mbps AS upload,
		       ping_ms AS ping, jitter_ms AS jitter, loss_pct AS loss
		FROM measurement
		WHERE time >= ${from} AND time <= ${to} AND NOT invalid
		ORDER BY time DESC
		LIMIT 1`;
	return row ? toPoint(row) : null;
}

/** Coarse full-history series behind the navigator strip. */
export async function loadOverview(): Promise<{
	series: { t: number; download: number }[];
	start: number;
	end: number;
}> {
	const [range] = await sql<{ lo: Date | null; hi: Date | null }[]>`
		SELECT min(time) AS lo, max(time) AS hi FROM measurement WHERE NOT invalid`;
	if (!range.lo || !range.hi) {
		const now = Date.now();
		return { series: [], start: now - 24 * 60 * MINUTE, end: now };
	}

	const bucketMs = Math.max(MINUTE, Math.round((+range.hi - +range.lo) / 260));
	const rows = await sql<{ t: Date; download: number }[]>`
		SELECT to_timestamp(avg(extract(epoch from time))) AS t,
		       avg(download_mbps) AS download
		FROM measurement
		WHERE NOT invalid
		GROUP BY date_bin(${`${bucketMs} milliseconds`}::interval, time, 'epoch'::timestamptz)
		ORDER BY 1`;

	return {
		series: rows.map((r) => ({ t: r.t.getTime(), download: Number(r.download ?? 0) })),
		start: range.lo.getTime(),
		// +1: Postgres timestamptz has microsecond precision, JS Date only milliseconds —
		// .getTime() truncates, so the row that IS the max can sub-millisecond-round to
		// just before `end`, silently dropping out of `WHERE time <= end` upper bounds
		// built from this value.
		end: range.hi.getTime() + 1
	};
}

interface TableQuery {
	/** Omit both to query all of history — the log page does. */
	from?: Date;
	to?: Date;
	query: string;
	sortKey: SortKey;
	desc: boolean;
	offset: number;
	limit: number;
	/** The log page keeps invalid-flagged rows visible; everywhere else excludes them. */
	includeInvalid?: boolean;
}

/** Sorting, filtering and paging all happen in the database*/
export async function loadRows(q: TableQuery): Promise<{ rows: Row[]; total: number; inRange: number }> {
	const column = sql(SORTABLE[q.sortKey]);
	const window =
		q.from && q.to ? sql`time >= ${q.from} AND time <= ${q.to}` : sql`TRUE`;
	const validOnly = q.includeInvalid ? sql`TRUE` : sql`NOT invalid`;
	const search = q.query.trim();
	const like = `%${search}%`;
	// An empty search is the TRUE predicate rather than a special case downstream.
	const matches = search
		? sql`(server ILIKE ${like} OR provider ILIKE ${like}
		       OR to_char(time, 'DD.MM YYYY HH24:MI') ILIKE ${like})`
		: sql`TRUE`;

	const rows = await sql`
		SELECT time AS t, provider, server, invalid,
		       download_mbps AS download, upload_mbps AS upload,
		       ping_ms AS ping, jitter_ms AS jitter, loss_pct AS loss
		FROM measurement
		WHERE ${window} AND ${validOnly} AND ${matches}
		ORDER BY ${column} ${q.desc ? sql`DESC` : sql`ASC`}
		LIMIT ${q.limit} OFFSET ${q.offset}`;

	const [counts] = await sql<{ matched: number; in_range: number }[]>`
		SELECT count(*)::int AS in_range,
		       count(*) FILTER (WHERE ${matches})::int AS matched
		FROM measurement
		WHERE ${window} AND ${validOnly}`;

	return {
		rows: rows.map((r) => ({ ...toPoint(r), provider: r.provider, server: r.server ?? '—', invalid: r.invalid })),
		total: counts.matched,
		inRange: counts.in_range
	};
}

/**
 * Raw points for alert derivation.
 * ponytail: bounded to the last N days so this never becomes a full-table scan.
 * Persist alerts to their own table if you ever need incident history beyond that.
 */
export async function loadRecentPoints(days = 90): Promise<Point[]> {
	const rows = await sql`
		SELECT time AS t, download_mbps AS download, upload_mbps AS upload,
		       ping_ms AS ping, jitter_ms AS jitter, loss_pct AS loss
		FROM measurement
		WHERE time > now() - ${`${days} days`}::interval AND NOT invalid
		ORDER BY time`;
	return rows.map(toPoint);
}

/** Streamed straight to the response — an export must not be bounded by available memory. */
export function streamCsv(from: Date, to: Date) {
	return sql`
		SELECT time, provider, server, download_mbps, upload_mbps, ping_ms, jitter_ms, loss_pct
		FROM measurement
		WHERE time >= ${from} AND time <= ${to} AND NOT invalid
		ORDER BY time`.cursor(1000);
}
