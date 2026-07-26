import type { Actions, PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { isSortKey, loadRows, type SortKey } from '$lib/server/data';

const PAGE_SIZE = 50;

/** Same query layer as the dashboard table, no time window — and, unlike the dashboard,
 * includes invalid-flagged rows so there's somewhere to see and undo a flag. */
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
		limit: PAGE_SIZE,
		includeInvalid: true
	});

	return { ...table, query, sortKey, desc, page, pageSize: PAGE_SIZE };
};

export const actions: Actions = {
	/** A bad reading — kept for the record here, excluded from the chart, averages and 
	 * alerts everywhere else. */
	toggleInvalid: async ({ request }) => {
		const form = await request.formData();
		const t = Number(form.get('t'));
		const provider = String(form.get('provider') ?? '');
		if (!Number.isFinite(t) || !provider) return;
		await sql`
			UPDATE measurement SET invalid = NOT invalid
			WHERE time >= ${new Date(t)} AND time < ${new Date(t + 1)} AND provider = ${provider}`;
	}
};
