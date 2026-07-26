import postgres from 'postgres';
import nodemailer from 'nodemailer';
import { computeAlerts, inBreach, fmtDur, DEFAULT_SETTINGS } from './shared/alerts.mjs';
import { providers } from './providers.mjs';
import { nextDelayMs } from './schedule.mjs';

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

// Alerts are derived from raw rows, so the window we re-derive over bounds the work.
// ponytail: 90 days is plenty to notice a new incident; widen it and this becomes a
// full-table scan every cycle. If it ever needs to be unbounded, persist alerts instead.
const ALERT_WINDOW_DAYS = 90;

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function loadSettings() {
	const [row] = await sql`SELECT v FROM settings WHERE k = 'app'`;
	return { ...DEFAULT_SETTINGS, ...(row?.v ?? {}) };
}

// ---------------------------------------------------------------- measuring

async function measure(settings) {
	const name = settings.provider || 'ookla';
	const at = new Date();

	const provider = providers[name];
	if (!provider) {
		log(`unknown provider "${name}", skipping`);
	} else {
		try {
			const r = await provider(settings);
			await sql`
				INSERT INTO measurement ${sql({
					time: at,
					provider: name,
					server: r.server,
					download_mbps: r.download,
					upload_mbps: r.upload,
					ping_ms: r.ping,
					jitter_ms: r.jitter,
					loss_pct: r.loss
				})}
				ON CONFLICT (time, provider) DO NOTHING`;
			log(`${name}: ↓${r.download.toFixed(1)} ↑${r.upload.toFixed(1)} ${r.ping.toFixed(0)}ms`);
		} catch (err) {
			// A failed test is data too, but it is not a measurement — log and move on.
			log(`${name} failed:`, err.message);
		}
	}
}

async function recentPoints() {
	const rows = await sql`
		SELECT time, download_mbps, upload_mbps, ping_ms, jitter_ms, loss_pct
		FROM measurement
		WHERE time > now() - ${`${ALERT_WINDOW_DAYS} days`}::interval AND NOT invalid
		ORDER BY time`;
	return rows.map((r) => ({
		t: r.time.getTime(),
		download: r.download_mbps ?? 0,
		upload: r.upload_mbps ?? 0,
		ping: r.ping_ms ?? 0,
		jitter: r.jitter_ms ?? 0,
		loss: r.loss_pct ?? 0
	}));
}

// ---------------------------------------------------------------- email

function transport(s) {
	if (!s.smtpHost) return null;
	return nodemailer.createTransport({
		host: s.smtpHost,
		port: Number(s.smtpPort) || 587,
		secure: s.smtpSec === 'ssltls',
		requireTLS: s.smtpSec === 'starttls',
		auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPass } : undefined
	});
}

async function recipient() {
	const [u] = await sql`SELECT email FROM app_user WHERE id = 1`;
	return u?.email;
}

async function sendMail(s, subject, text) {
	const t = transport(s);
	const to = await recipient();
	if (!t || !to) throw new Error('SMTP host or recipient address not configured');
	await t.sendMail({ from: s.smtpFrom || s.smtpUser, to, subject, text });
}

/** Email every alert we have not emailed before. */
// The web UI renders alerts in the user's language; a machine notification stays English.
const TITLES = {
	outage: 'Connection outage',
	sustained: 'Sustained speed breach',
	loss: 'Packet loss spike',
	latency: 'Latency spike'
};
const METRICS = {
	download: 'Download',
	upload: 'Upload',
	both: 'Download & upload',
	loss: 'Packet loss',
	ping: 'Ping'
};

function describe(a) {
	const metric = METRICS[a.metric];
	const what = {
		outage: `${metric} collapsed to ${a.params.value} Mbps, below the ${a.params.floor} Mbps large-drop floor.`,
		sustained: `${metric} held under ${a.params.floor} Mbps for ${fmtDur(a.dur)}.`,
		loss: `Packet loss reached ${a.params.value}%.`,
		latency: `Ping peaked at ${a.params.value} ms.`
	}[a.kind];
	return `${what}\n\nStarted: ${new Date(a.start).toISOString()}\nDuration: ${fmtDur(a.dur)}\nSeverity: ${a.sev}\n`;
}

async function notifyNewAlerts(settings, points) {
	if (!settings.smtpEnabled || !settings.smtpHost) return;
	const alerts = computeAlerts(points, settings);
	if (!alerts.length) return;

	const sent = new Set(
		(await sql`SELECT id FROM alert_sent WHERE id IN ${sql(alerts.map((a) => a.id))}`).map(
			(r) => r.id
		)
	);
	const fresh = alerts.filter((a) => !sent.has(a.id));

	for (const a of fresh) {
		try {
			await sendMail(settings, `[SpeedMeasure] ${TITLES[a.kind]}`, describe(a));
			await sql`INSERT INTO alert_sent ${sql({ id: a.id })} ON CONFLICT DO NOTHING`;
			log(`emailed alert ${a.id}`);
		} catch (err) {
			// Leave it unmarked so the next cycle retries.
			log(`alert email failed:`, err.message);
		}
	}
}

// ---------------------------------------------------------------- loop

let wake = null;
const sleep = (ms) =>
	new Promise((resolve) => {
		const timer = setTimeout(() => ((wake = null), resolve()), ms);
		wake = () => (clearTimeout(timer), (wake = null), resolve());
	});

async function main() {
	// The web app pokes us over LISTEN/NOTIFY — no queue, no broker, no HTTP between them.
	await sql.listen('run_now', () => {
		log('run requested');
		wake?.();
	});
	await sql.listen('test_email', async () => {
		try {
			await sendMail(
				await loadSettings(),
				'[SpeedMeasure] Test email',
				'SMTP is configured correctly.'
			);
			log('test email sent');
		} catch (err) {
			log('test email failed:', err.message);
		}
	});

	for (;;) {
		const settings = await loadSettings();
		await measure(settings);

		const points = await recentPoints();
		await notifyNewAlerts(settings, points);

		const delay = nextDelayMs(settings, inBreach(points.at(-1), settings), new Date());
		log(`next test in ${fmtDur(delay)}`);
		await sleep(delay);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
