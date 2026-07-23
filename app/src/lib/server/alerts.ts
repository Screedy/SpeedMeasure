import { computeAlerts, type Alert } from '$shared/alerts.mjs';
import { sql } from './db';
import { loadRecentPoints } from './data';
import { getSettings } from './settings';

export async function loadAlerts(): Promise<{ alerts: Alert[]; acked: string[] }> {
	const [settings, points, acks] = await Promise.all([
		getSettings(),
		loadRecentPoints(),
		sql<{ id: string }[]>`SELECT id FROM alert_ack`
	]);

	return { alerts: computeAlerts(points, settings), acked: acks.map((a) => a.id) };
}

export function countOpen(alerts: Alert[], acked: string[]) {
	const set = new Set(acked);
	return alerts.filter((a) => !set.has(a.id)).length;
}
