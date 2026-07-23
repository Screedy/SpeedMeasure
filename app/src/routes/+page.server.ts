import type { Actions, PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { isSortKey, loadBuckets, loadOverview, loadRows, type SortKey } from '$lib/server/data';

const DAY = 864e5;
const PAGE_SIZE = 12;

/**
 * Reads the view state out of the URL, so every window is a shareable, reloadable link.
 * The default (no url params) 3-day lookback is clamped to the real data range — a new
 * app with only a few hours of history should default to showing all of it, not a mostly
 * empty 3-day window with the actual tests squeezed into one corner.
 */
function parseRange(url: URL, overview: { start: number; end: number }) {
	const to = Number(url.searchParams.get('to')) || overview.end;
	const from = Number(url.searchParams.get('from')) || Math.max(overview.start, to - 3 * DAY);
	return { from: Math.min(from, to), to: Math.max(from, to) };
}

export const load: PageServerLoad = async ({ url }) => {
	const overview = await loadOverview();
	const { from, to } = parseRange(url, overview);

	const query = url.searchParams.get('q') ?? '';
	const sortParam = url.searchParams.get('sort') ?? 't';
	const sortKey: SortKey = isSortKey(sortParam) ? sortParam : 't';
	const desc = (url.searchParams.get('dir') ?? 'desc') === 'desc';
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

	const [buckets, table] = await Promise.all([
		loadBuckets(new Date(from), new Date(to)),
		loadRows({
			from: new Date(from),
			to: new Date(to),
			query,
			sortKey,
			desc,
			offset: (page - 1) * PAGE_SIZE,
			limit: PAGE_SIZE
		})
	]);

	return {
		overview,
		from,
		to,
		buckets,
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
