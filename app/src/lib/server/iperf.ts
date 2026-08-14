import { randomUUID } from 'node:crypto';
import { sql } from './db';

export interface IperfTarget {
	id: string;
	name: string;
	host: string;
	port: number;
	linkMbps: number | null;
}

export type RunStatus = 'pending' | 'running' | 'done' | 'error' | 'stopped';
export type Direction = 'down' | 'up' | 'bidir';
export type Protocol = 'tcp' | 'udp';

export interface TcpResult {
	proto: 'tcp';
	sender: number | null;
	receiver: number | null;
	retr: number;
	cwndMB: number | null;
}

export interface UdpResult {
	proto: 'udp';
	sender: number | null;
	receiver: number | null;
	jitterMs: number | null;
	lost: number | null;
	total: number | null;
	lossPct: number | null;
}

export interface IperfRun {
	id: string;
	targetName: string;
	targetHost: string;
	targetPort: number;
	direction: Direction;
	protocol: Protocol;
	duration: number;
	streams: number;
	status: RunStatus;
	term: string;
	samples: { t: number; mbps: number }[];
	result: TcpResult | UdpResult | null;
	error: string | null;
	createdAt: number;
}

const toRun = (r: Record<string, unknown>): IperfRun => ({
	id: r.id as string,
	targetName: r.target_name as string,
	targetHost: r.target_host as string,
	targetPort: r.target_port as number,
	direction: r.direction as Direction,
	protocol: r.protocol as Protocol,
	duration: r.duration as number,
	streams: r.streams as number,
	status: r.status as RunStatus,
	term: r.term as string,
	samples: (r.samples as IperfRun['samples']) ?? [],
	result: (r.result as IperfRun['result']) ?? null,
	error: r.error as string | null,
	createdAt: (r.created_at as Date).getTime()
});

export async function listTargets(): Promise<IperfTarget[]> {
	const rows = await sql`SELECT * FROM iperf_target ORDER BY created_at`;
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		host: r.host,
		port: r.port,
		linkMbps: r.link_mbps
	}));
}

export async function addTarget(t: { name: string; host: string; port: number; linkMbps: number | null }) {
	await sql`INSERT INTO iperf_target ${sql({ id: randomUUID(), name: t.name, host: t.host, port: t.port, link_mbps: t.linkMbps })}`;
}

export async function removeTarget(id: string) {
	await sql`DELETE FROM iperf_target WHERE id = ${id}`;
}

/** Everything but the (possibly large) transcript — enough for the history list. */
export async function listRuns(
	limit: number,
	offset: number
): Promise<{ rows: Omit<IperfRun, 'term' | 'samples'>[]; total: number }> {
	const [rows, [{ count }]] = await Promise.all([
		sql`
			SELECT id, target_name, target_host, target_port, direction, protocol, duration,
			       streams, status, result, error, created_at
			FROM iperf_run ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
		sql`SELECT count(*)::int FROM iperf_run`
	]);

	return {
		rows: rows.map((r) => {
			const { term: _term, samples: _samples, ...rest } = toRun({ ...r, term: '', samples: [] });
			return rest;
		}),
		total: count
	};
}

export async function getRun(id: string): Promise<IperfRun | null> {
	const [row] = await sql`SELECT * FROM iperf_run WHERE id = ${id}`;
	return row ? toRun(row) : null;
}

export async function getLatestRun(): Promise<IperfRun | null> {
	const [row] = await sql`SELECT * FROM iperf_run ORDER BY created_at DESC LIMIT 1`;
	return row ? toRun(row) : null;
}

export async function createRun(job: {
	targetName: string;
	targetHost: string;
	targetPort: number;
	direction: Direction;
	protocol: Protocol;
	duration: number;
	streams: number;
}): Promise<string> {
	const id = randomUUID();
	await sql`
		INSERT INTO iperf_run ${sql({
			id,
			target_name: job.targetName,
			target_host: job.targetHost,
			target_port: job.targetPort,
			direction: job.direction,
			protocol: job.protocol,
			duration: job.duration,
			streams: job.streams
		})}`;
	await sql.notify('iperf_run', '');
	return id;
}

export async function stopRun(id: string) {
	await sql.notify('iperf_stop', id);
}

export async function deleteRun(id: string) {
	await sql`DELETE FROM iperf_run WHERE id = ${id}`;
}
