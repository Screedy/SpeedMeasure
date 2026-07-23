import type { PageServerLoad } from './$types';
import { isSortKey, loadRows, type SortKey } from '$lib/server/data';

const PAGE_SIZE = 50;

/** The unfiltered firehose: same query layer as the dashboard table, no time window. */
export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q') ?? '';
	const sortParam = url.searchParams.get('sort') ?? 't';
	const sortKey: SortKey = isSortKey(sortParam) ? sortParam : 't';
	const desc = (url.searchParams.get('dir') ?? 'desc') === 'desc';
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

	const table = await loadRows({
		query,
		sortKey,
		desc,
		offset: (page - 1) * PAGE_SIZE,
		limit: PAGE_SIZE
	});

	return { ...table, query, sortKey, desc, page, pageSize: PAGE_SIZE };
};
