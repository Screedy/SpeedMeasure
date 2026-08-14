import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const log = (...a) => console.log(new Date().toISOString(), ...a);

const CONNECT_TIMEOUT_MS = 5000;
const BITRATE_RE = /sec\s+[\d.]+\s*[KMG]?Bytes\s+([\d.]+)\s*([KMG]?)bits\/sec/;
const UNIT_TO_MBPS = { '': 1e-6, K: 1e-3, M: 1, G: 1e3 };

const isFinalLine = (line) => /\b(sender|receiver)\s*$/.test(line);

function bitrateMbps(line) {
	const m = BITRATE_RE.exec(line);
	if (!m) return null;
	return +m[1] * UNIT_TO_MBPS[m[2]];
}

/** Returns true for lines that are chartable interval results, not final summary lines. */
function isChartLine(line, job) {
	if (isFinalLine(line)) return false;
	if (job.direction === 'bidir') return line.includes('[TX-C]');
	if (job.streams > 1) return line.startsWith('[SUM]');
	return /^\[\s*\d+\]/.test(line) && !line.includes('[TX-C]') && !line.includes('[RX-C]');
}

function buildArgs(job) {
	const args = [
		'-c',
		job.target_host,
		'-p',
		String(job.target_port),
		'-t',
		String(job.duration),
		'-P',
		String(job.streams),
		'--connect-timeout',
		String(CONNECT_TIMEOUT_MS),
		// `--forceflush` is a workaround for iperf3's bug where it sometimes buffers output and doesn't flush it 
		// until the end of the run, which breaks live progress display.
		'--forceflush'
	];
	if (job.direction === 'down') args.push('-R');
	if (job.direction === 'bidir') args.push('--bidir');
	if (job.protocol === 'udp') args.push('-u', '-b', '0');
	return args;
}

/** The last matching sender/receiver pair — the final [SUM] pair when there are
 * multiple streams, otherwise the single stream's pair. Bidir has two pairs
 * (TX-C, RX-C); TX-C is treated as the primary result, matching the one series
 * the chart draws. */
function parseResult(lines, job) {
	const prefix = job.streams > 1 ? '[SUM]' : job.direction === 'bidir' ? '[TX-C]' : null;
	const isOurs = (line) => (prefix ? line.includes(prefix) : !line.includes('[TX-C]') && !line.includes('[RX-C]'));
	const finals = lines.filter((l) => isFinalLine(l) && isOurs(l));
	const senderLine = finals.findLast((l) => l.trimEnd().endsWith('sender'));
	const receiverLine = finals.findLast((l) => l.trimEnd().endsWith('receiver'));
	if (!senderLine || !receiverLine) return null;

	const sender = bitrateMbps(senderLine);
	const receiver = bitrateMbps(receiverLine);
	if (job.protocol === 'udp') {
		const m = /([\d.]+)\s*ms\s+(\d+)\/(\d+)\s*\(([\d.]+)%\)/.exec(receiverLine);
		return {
			proto: 'udp',
			sender,
			receiver,
			jitterMs: m ? +m[1] : null,
			lost: m ? +m[2] : null,
			total: m ? +m[3] : null,
			lossPct: m ? +m[4] : null
		};
	}
	// TCP: parse the retransmits from the sender line, and the last interval's cwnd (if any) from the last interval line.
	const retrMatch = /bits\/sec\s+(\d+)\s+sender/.exec(senderLine);
	const lastInterval = lines.findLast((l) => isChartLine(l, job) && /Bytes\s*$/.test(l.trimEnd()));
	const cwndMatch = lastInterval && /([\d.]+)\s*([KMG]?)Bytes\s*$/.exec(lastInterval.trimEnd());
	return {
		proto: 'tcp',
		sender,
		receiver,
		retr: retrMatch ? +retrMatch[1] : 0,
		cwndMB: cwndMatch ? (+cwndMatch[1] * (cwndMatch[2] === 'G' ? 1024 : cwndMatch[2] === 'K' ? 1 / 1024 : 1)) : null
	};
}

/** Runs a single iperf3 job, updating the database with its progress and final result. */
async function runOne(sql, job, children, stopped) {
	await sql`UPDATE iperf_run SET status = 'running' WHERE id = ${job.id}`;

	const lines = [];
	let samples = [];
	let lastFlush = 0;
	const flush = async (force) => {
		const now = Date.now();
		if (!force && now - lastFlush < 300) return;
		lastFlush = now;
		await sql`
			UPDATE iperf_run SET term = ${lines.join('\n')}, samples = ${sql.json(samples)}
			WHERE id = ${job.id}`;
	};

	const child = spawn('iperf3', buildArgs(job));
	children.set(job.id, child);

	const onLine = (raw) => {
		const line = raw.replace(/\s+$/, '');
		if (!line) return;
		lines.push(line);
		if (isChartLine(line, job)) {
			const mbps = bitrateMbps(line);
			if (mbps !== null) samples.push({ t: samples.length + 1, mbps });
		}
		flush(false);
	};
	createInterface({ input: child.stdout }).on('line', onLine);
	createInterface({ input: child.stderr }).on('line', onLine);

	const [code, signal] = await new Promise((resolve) => child.on('close', (c, s) => resolve([c, s])));
	children.delete(job.id);
	await flush(true);

	// If the job was stopped, we don't care about the result — 
	// it may be incomplete or invalid. Just mark it as stopped and return.
	if (signal || stopped.has(job.id)) {
		stopped.delete(job.id);
		await sql`UPDATE iperf_run SET status = 'stopped', finished_at = now() WHERE id = ${job.id}`;
		log(`iperf run ${job.id} stopped`);
		return;
	}
	const result = code === 0 ? parseResult(lines, job) : null;
	if (result) {
		await sql`
			UPDATE iperf_run SET status = 'done', result = ${sql.json(result)}, finished_at = now()
			WHERE id = ${job.id}`;
		log(`iperf run ${job.id}: ${job.target_host}:${job.target_port} → ${result.receiver?.toFixed(1)} Mbps`);
	} else {
		const error = lines.at(-1) || `iperf3 exited with code ${code}`;
		await sql`UPDATE iperf_run SET status = 'error', error = ${error}, finished_at = now() WHERE id = ${job.id}`;
		log(`iperf run ${job.id} failed:`, error);
	}
}

/** Listens for new iperf jobs and runs them one at a time, updating the database with progress and results. */
export async function listenIperf(sql) {
	const children = new Map();
	const stopped = new Set();
	let draining = false;

	async function drain() {
		if (draining) return;
		draining = true;
		try {
			for (;;) {
				const [job] = await sql`
					SELECT * FROM iperf_run WHERE status = 'pending' ORDER BY created_at LIMIT 1`;
				if (!job) break;
				try {
					await runOne(sql, job, children, stopped);
				} catch (err) {
					log(`iperf run ${job.id} crashed:`, err.message);
					await sql`UPDATE iperf_run SET status = 'error', error = ${err.message}, finished_at = now() WHERE id = ${job.id}`;
				}
			}
		} finally {
			draining = false;
		}
	}

	await sql.listen('iperf_run', () => drain());
	await sql.listen('iperf_stop', (runId) => {
		if (children.get(runId)?.kill()) stopped.add(runId);
	});

	await sql`UPDATE iperf_run SET status = 'error', error = 'interrupted by restart', finished_at = now() WHERE status = 'running'`;
	drain();
}
