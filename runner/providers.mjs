import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROVIDER_NAMES } from './shared/providers.mjs';

const exec = promisify(execFile);
const TIMEOUT_MS = 5 * 60_000;

const sh = async (cmd, args) => (await exec(cmd, args, { timeout: TIMEOUT_MS })).stdout;

const IPERF_DEFAULT_PORT = '5201';

/**
 * Each provider returns the same shape, in the same units:
 * { server, download, upload (Mbps), ping, jitter (ms), loss (%) }
 *
 * Every provider is called with the current settings, in case it needs one (only
 * iperf3 does, for the target server) — the rest just ignore the argument.
 *
 */
export const providers = {
	async ookla() {
		const j = JSON.parse(
			await sh('speedtest', ['-f', 'json', '--accept-license', '--accept-gdpr'])
		);
		return {
			server: `${j.server.location} · ${j.server.name}`,
			// Ookla reports bytes/s
			download: (j.download.bandwidth * 8) / 1e6,
			upload: (j.upload.bandwidth * 8) / 1e6,
			ping: j.ping.latency,
			jitter: j.ping.jitter,
			loss: j.packetLoss ?? 0
		};
	},

	async librespeed() {
		const [j] = JSON.parse(await sh('librespeed-cli', ['--json']));
		return {
			server: j.server?.name ?? 'LibreSpeed',
			download: j.download,
			upload: j.upload,
			ping: j.ping,
			jitter: j.jitter,
			// librespeed-cli does not measure packet loss.
			loss: null
		};
	},

	async iperf3(settings) {
		const target = (settings?.iperfServer ?? '').trim();
		if (!target) throw new Error('no iperf3 server configured (Settings → Test schedule)');
		const [host, port = IPERF_DEFAULT_PORT] = target.split(':');

		const run = async (...args) =>
			JSON.parse(
				await sh('iperf3', ['-c', host, '-p', port, '-J', '-t', '10', '--connect-timeout', '5000', ...args])
			);

		// One direction per run — iperf3's single-connection --bidir mode reports
		// download/upload combined in a way that varies across versions, so two plain
		// runs (upload, then reverse for download) is the version-safe way to get both.
		const up = await run();
		const down = await run('-R');
		const mbps = (bitsPerSecond) => bitsPerSecond / 1e6;

		// Jitter and loss are UDP-only in iperf3 — a plain TCP run never measures them.
		// Probe with a third, throwaway UDP run sent at roughly the guaranteed download
		// rate, so loss reflects real link quality rather than an arbitrary probe rate.
		let jitter = 0;
		let loss = null;
		try {
			const rate = Math.max(1, Math.round(settings?.planDown || 100));
			const udp = await run('-u', '-b', `${rate}M`);
			jitter = udp.end.sum.jitter_ms ?? 0;
			loss = udp.end.sum.lost_percent ?? null;
		} catch {
			// unmeasured, not zero — see loss: null convention below
		}

		return {
			server: `${host}:${port}`,
			download: mbps(down.end.sum_received.bits_per_second),
			upload: mbps(up.end.sum_sent.bits_per_second),
			// TCP_INFO round-trip time from the upload run — the closest thing to "ping"
			// a plain TCP throughput test exposes.
			ping: (up.end.streams?.[0]?.sender?.mean_rtt ?? 0) / 1000,
			jitter,
			loss
		};
	}
};

// Fails at import time if the canonical list and the implementations drift apart.
for (const name of PROVIDER_NAMES) {
	if (!providers[name]) throw new Error(`provider "${name}" is listed but not implemented`);
}
