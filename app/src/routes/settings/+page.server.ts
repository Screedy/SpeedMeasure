import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { destroySession, hashPassword, verifyPassword } from '$lib/server/auth';
import { getSettings, redactSettings, saveSettings, SMTP_PASS_UNCHANGED } from '$lib/server/settings';
import { m } from '$lib/paraglide/messages';
import { PROVIDER_NAMES } from '$shared/providers.mjs';

const MIN_PASSWORD = 10;

export const load: PageServerLoad = async ({ locals }) => ({
	settings: redactSettings(await getSettings()),
	email: locals.user!.email,
	providers: PROVIDER_NAMES
});

/** Clamp anything numeric coming off a form — the browser's `min` attribute is a suggestion. */
const int = (form: FormData, key: string, min: number, max: number, fallback: number) => {
	const n = Math.round(Number(form.get(key)));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

// Deliberately permissive: this is a "did you typo it" check, not an RFC 5322 parser.
const isEmail = (v: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

export const actions: Actions = {
	saveAccount: async ({ request }) => {
		const email = str(await request.formData(), 'email');
		if (!isEmail(email)) return fail(400, { section: 'account', error: m.error_email_invalid() });

		await sql`UPDATE app_user SET email = ${email} WHERE id = 1`;
		return { section: 'account' };
	},

	savePassword: async ({ request, locals }) => {
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('next') ?? '');

		if (next !== String(form.get('confirm') ?? ''))
			return fail(400, { section: 'password', error: m.error_password_mismatch() });
		if (next.length < MIN_PASSWORD)
			return fail(400, { section: 'password', error: m.error_password_short() });

		const [user] = await sql<{ pw_hash: string }[]>`SELECT pw_hash FROM app_user WHERE id = 1`;
		if (!user || !(await verifyPassword(current, user.pw_hash)))
			return fail(400, { section: 'password', error: m.error_credentials() });

		await sql`UPDATE app_user SET pw_hash = ${await hashPassword(next)} WHERE id = 1`;
		void locals;
		return { section: 'password' };
	},

	saveSchedule: async ({ request }) => {
		const form = await request.formData();
		const provider = str(form, 'provider');

		await saveSettings({
			sched: form.get('sched') === 'daily' ? 'daily' : 'interval',
			interval: int(form, 'interval', 1, 60 * 24 * 7, 30),
			time: /^\d{2}:\d{2}$/.test(str(form, 'time')) ? str(form, 'time') : '03:00',
			adaptive: form.has('adaptive'),
			adaptiveInterval: int(form, 'adaptiveInterval', 1, 60 * 24, 5),
			provider: PROVIDER_NAMES.includes(provider) ? provider : 'ookla',
			iperfServer: str(form, 'iperfServer')
		});
		return { section: 'schedule' };
	},

	saveSmtp: async ({ request }) => {
		const form = await request.formData();
		const security = str(form, 'smtpSec');
		const password = String(form.get('smtpPass') ?? '');

		await saveSettings({
			smtpEnabled: form.has('smtpEnabled'),
			smtpHost: str(form, 'smtpHost'),
			smtpPort: int(form, 'smtpPort', 1, 65535, 587),
			smtpSec: security === 'none' || security === 'ssltls' ? security : 'starttls',
			smtpUser: str(form, 'smtpUser'),
			// The form only ever receives a placeholder, so an unchanged field must not wipe it.
			...(password && password !== SMTP_PASS_UNCHANGED ? { smtpPass: password } : {}),
			smtpFrom: str(form, 'smtpFrom')
		});
		return { section: 'smtp' };
	},

	sendTestEmail: async () => {
		// The runner owns SMTP, so there is exactly one place that talks to a mail server.
		await sql.notify('test_email', '');
		return { section: 'smtptest' };
	},

	saveGuarantee: async ({ request }) => {
		const form = await request.formData();
		await saveSettings({
			planDown: int(form, 'planDown', 1, 1_000_000, 940),
			planUp: int(form, 'planUp', 1, 1_000_000, 50),
			gThreshold: int(form, 'gThreshold', 10, 100, 60),
			gMinThreshold: int(form, 'gMinThreshold', 1, 100, 30),
			gMaxDrop: int(form, 'gMaxDrop', 1, 60 * 24 * 7, 70)
		});
		return { section: 'guarantee' };
	},

	signOut: async ({ cookies }) => {
		destroySession(cookies);
		redirect(303, '/login');
	}
};
