import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sql } from '$lib/server/db';
import { createSession, hashPassword, needsSetup, verifyPassword } from '$lib/server/auth';
import { m } from '$lib/paraglide/messages';

const MIN_PASSWORD = 10;
const isEmail = (v: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { setup: await needsSetup() };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		// First run: no account exists yet, so this form creates one instead of signing in.
		if (await needsSetup()) {
			if (!isEmail(email)) return fail(400, { error: m.error_email_invalid() });
			if (password.length < MIN_PASSWORD) return fail(400, { error: m.error_password_short() });
			if (password !== String(form.get('confirm') ?? ''))
				return fail(400, { error: m.error_password_mismatch() });

			await sql`INSERT INTO app_user ${sql({ id: 1, email, pw_hash: await hashPassword(password) })}`;
			createSession(cookies);
			redirect(303, '/');
		}

		const [user] = await sql<{ email: string; pw_hash: string }[]>`
			SELECT email, pw_hash FROM app_user WHERE id = 1`;

		// Same failure for a wrong address and a wrong password — do not confirm which.
		if (!user || user.email !== email || !(await verifyPassword(password, user.pw_hash)))
			return fail(400, { error: m.error_credentials() });

		createSession(cookies);
		redirect(303, '/');
	}
};
