import type { Actions, PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { isSortKey, loadBuckets, loadLatest, loadOverview, loadRows, type SortKey } from '$lib/server/data';

const DAY = 864e5;
const PAGE_SIZE = 12;

/** Preset window lengths, keyed by the `range` URL param. `null` means "all history". */
const RANGE_PRESETS: Record<string, number | null> = {
	'24h': DAY,
	'3d': 3 * DAY,
	'7d': 7 * DAY,
	'14d': 14 * DAY,
	all: null
};

/**
 * Reads the view state out of the URL, so every window is a shareable, reloadable link.
 *
 * A preset (`range=3d` etc.) is a rolling window — re-derived from the current overview
 * on every load, so new measurements keep showing up without the user re-clicking it.
 * An explicit `from`/`to` (typed dates, or a drag on the navigator) is a deliberate,
 * absolute window and stays pinned exactly where the user put it.
 *
 * The default (no url params at all) is the same rolling behavior as a 3-day preset,
 * clamped to the real data range — a new app with only a few hours of history should
 * default to showing all of it, not a mostly empty 3-day window with the actual tests
 * squeezed into one corner.
 */
function parseRange(url: URL, overview: { start: number; end: number }) {
	const rangeParam = url.searchParams.get('range');
	const hasExplicitWindow = url.searchParams.has('from') || url.searchParams.has('to');
	const presetId = rangeParam && rangeParam in RANGE_PRESETS ? rangeParam : hasExplicitWindow ? null : '3d';

	if (presetId) {
		const ms = RANGE_PRESETS[presetId];
		const to = overview.end;
		const from = ms === null ? overview.start : Math.max(overview.start, to - ms);
		// Clamping pulled `from` back to the true start — the effective window is "all
		// history" regardless of which preset asked for it, so label it that way and let
		// the right button highlight, matching what's actually on screen.
		const range = ms !== null && from === overview.start ? 'all' : presetId;
		return { from, to, range };
	}

	const to = Number(url.searchParams.get('to')) || overview.end;
	const from = Number(url.searchParams.get('from')) || Math.max(overview.start, to - 3 * DAY);
	return { from: Math.min(from, to), to: Math.max(from, to), range: null };
}

export const load: PageServerLoad = async ({ url }) => {
	const overview = await loadOverview();
	const { from, to, range } = parseRange(url, overview);

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
