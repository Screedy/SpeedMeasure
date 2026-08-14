import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	addTarget,
	createRun,
	deleteRun,
	getLatestRun,
	getRun,
	listRuns,
	listTargets,
	removeTarget,
	stopRun,
	type Direction,
	type Protocol
} from '$lib/server/iperf';
import { m } from '$lib/paraglide/messages';

const DIRECTIONS: Direction[] = ['down', 'up', 'bidir'];
const PROTOCOLS: Protocol[] = ['tcp', 'udp'];
const HISTORY_PAGE_SIZE = 6;

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** Clamp anything numeric coming off a form — the browser's `min`/`max` are a suggestion. */
const int = (form: FormData, key: string, min: number, max: number, fallback: number) => {
	const n = Math.round(Number(form.get(key)));
	
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const oneOf = <T extends string>(form: FormData, key: string, options: T[], fallback: T): T => {
	const v = str(form, key);
	
	return (options as string[]).includes(v) ? (v as T) : fallback;
};

export const load: PageServerLoad = async ({ url }) => {
	const runId = url.searchParams.get('run');
	const historyPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const [targets, displayedRun, history] = await Promise.all([
		listTargets(),
		runId ? getRun(runId) : getLatestRun(),
		listRuns(HISTORY_PAGE_SIZE, (historyPage - 1) * HISTORY_PAGE_SIZE)
	]);

	return {
		targets,
		displayedRun,
		history: history.rows,
		historyTotal: history.total,
		historyPage,
		historyPageSize: HISTORY_PAGE_SIZE
	};
};

export const actions: Actions = {
	addTarget: async ({ request }) => {
		const form = await request.formData();
		const host = str(form, 'host');
		
		if (!host) return fail(400, { section: 'target', error: m.error_host_required() });

		const name = str(form, 'name') || host;
		const port = int(form, 'port', 1, 65535, 5201);
		const linkRaw = str(form, 'linkMbps');
		const linkMbps = linkRaw ? int(form, 'linkMbps', 1, 1_000_000, 1000) : null;
		
		await addTarget({ name, host, port, linkMbps });
		return { section: 'target' };
	},

	removeTarget: async ({ request }) => {
		const id = str(await request.formData(), 'id');
		if (id) await removeTarget(id);
	},

	runTest: async ({ request }) => {
		const form = await request.formData();
		const targetHost = str(form, 'targetHost');
		
		if (!targetHost) return fail(400, { section: 'run', error: m.error_pick_target() });

		const id = await createRun({
			targetName: str(form, 'targetName') || targetHost,
			targetHost,
			targetPort: int(form, 'targetPort', 1, 65535, 5201),
			direction: oneOf(form, 'direction', DIRECTIONS, 'down'),
			protocol: oneOf(form, 'protocol', PROTOCOLS, 'tcp'),
			duration: int(form, 'duration', 1, 60, 10),
			streams: int(form, 'streams', 1, 128, 1)
		});
		return { section: 'run', runId: id };
	},

	stopRun: async ({ request }) => {
		const id = str(await request.formData(), 'id');
		if (id) await stopRun(id);
	},

	deleteRun: async ({ request }) => {
		const id = str(await request.formData(), 'id');
		if (id) await deleteRun(id);
	}
};
