import type { Actions, PageServerLoad } from './$types';
import { loadAlerts } from '$lib/server/alerts';
import { sql } from '$lib/server/db';

export const load: PageServerLoad = async () => loadAlerts();

export const actions: Actions = {
	toggleAck: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return;
		// One statement for both directions: delete if present, insert if not.
		const deleted = await sql`DELETE FROM alert_ack WHERE id = ${id} RETURNING id`;
		if (!deleted.length) await sql`INSERT INTO alert_ack ${sql({ id })}`;
	},

	ackAll: async () => {
		const { alerts } = await loadAlerts();
		if (!alerts.length) return;
		await sql`
			INSERT INTO alert_ack ${sql(alerts.map((a) => ({ id: a.id })))}
			ON CONFLICT (id) DO NOTHING`;
	}
};
