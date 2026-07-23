import type { LayoutServerLoad } from './$types';
import { countOpen, loadAlerts } from '$lib/server/alerts';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { user: null, openAlerts: 0 };

	const { alerts, acked } = await loadAlerts();
	return { user: locals.user, openAlerts: countOpen(alerts, acked) };
};
