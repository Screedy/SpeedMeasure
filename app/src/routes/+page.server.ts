import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { isSortKey, loadBuckets, loadLatest, loadOverview, loadRows, type SortKey } from '$lib/server/data';

const DAY = 864e5;
const YEAR = 365 * DAY;
const PAGE_SIZE = 12;
const WINDOW_COOKIE = 'sm_window';

/** Preset window lengths, keyed by the `range` URL param. `null` means "all history". */
const RANGE_PRESETS: Record<string, number | null> = {
	'24h': DAY,
	'3d': 3 * DAY,
	'7d': 7 * DAY,
	'14d': 14 * DAY,
	all: null
};

function presetWindow(id: string, overview: { start: number; end: number }) {
	const ms = RANGE_PRESETS[id];
	const to = overview.end;
	const from = ms === null ? overview.start : Math.max(overview.start, to - ms);
	const range = ms !== null && from === overview.start ? 'all' : id;
	
	return { from, to, range };
}

function rememberWindow(cookies: Cookies, value: string) {
	cookies.set(WINDOW_COOKIE, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !env.INSECURE_COOKIES,
		maxAge: YEAR / 1000
	});
}

/**
 * Reads the view state out of the URL, so every window is a shareable, reloadable link —
 * editing `range`, `from` or `to` by hand and reloading always wins, exactly as typed.
 *
 * A preset (`range=3d` etc.) is a rolling window — re-derived from the current overview
 * on every load, so new measurements keep showing up without the user re-clicking it.
 * An explicit `from`/`to` (typed dates, or a drag on the navigator) is a deliberate,
 * absolute window and stays pinned exactly where the user put it.
 *
 * Only when the URL has neither does the *last* window get remembered — in a cookie, not
 * by rewriting the URL, so a bare `/` (the rail's "Speed" link) renders whatever you had
 * last instead of always resetting to 3d, without a client-side redirect flickering the
 * default first or fighting a URL you're editing by hand.
 */
function parseRange(url: URL, overview: { start: number; end: number }, cookies: Cookies) {
	const rangeParam = url.searchParams.get('range');
	const hasExplicitWindow = url.searchParams.has('from') || url.searchParams.has('to');

	if (hasExplicitWindow) {
		const to = Number(url.searchParams.get('to')) || overview.end;
		const from = Number(url.searchParams.get('from')) || Math.max(overview.start, to - 3 * DAY);
		const win = { from: Math.min(from, to), to: Math.max(from, to), range: null };
		
		rememberWindow(cookies, `${win.from},${win.to}`);
		
		return win;
	}

	if (rangeParam && rangeParam in RANGE_PRESETS) {
		rememberWindow(cookies, rangeParam);
		
		return presetWindow(rangeParam, overview);
	}

	// Nothing in the URL — fall back to what was last remembered, then to 3d.
	const saved = cookies.get(WINDOW_COOKIE);
	const [savedFrom, savedTo] = saved?.split(',').map(Number) ?? [];

	if (Number.isFinite(savedFrom) && Number.isFinite(savedTo)) {
		return { from: savedFrom, to: Math.max(savedFrom, savedTo), range: null };
	}

	return presetWindow(saved && saved in RANGE_PRESETS ? saved : '3d', overview);
}

export const load: PageServerLoad = async ({ url, cookies }) => {
	const overview = await loadOverview();
	const { from, to, range } = parseRange(url, overview, cookies);

	const query = url.searchParams.get('q') ?? '';
	const sortParam = url.searchParams.get('sort') ?? 't';
	const sortKey: SortKey = isSortKey(sortParam) ? sortParam : 't';
	const desc = (url.searchParams.get('dir') ?? 'desc') === 'desc';
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

	const [buckets, table, latest] = await Promise.all([
		loadBuckets(new Date(from), new Date(to)),
		loadRows({
			from: new Date(from),
			to: new Date(to),
			query,
			sortKey,
			desc,
			offset: (page - 1) * PAGE_SIZE,
			limit: PAGE_SIZE
		}),
		loadLatest(new Date(from), new Date(to))
	]);

	return {
		overview,
		from,
		to,
		range,
		buckets,
		latest,
		query,
		sortKey,
		desc,
		page,
		pageSize: PAGE_SIZE,
		...table
	};
};

export const actions: Actions = {
	/** Nudge the runner. LISTEN/NOTIFY means no queue and no HTTP call between containers. */
	runNow: async () => {
		await sql.notify('run_now', '');
		return { queued: true };
	}
};
