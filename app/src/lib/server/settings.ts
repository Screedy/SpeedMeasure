import { DEFAULT_SETTINGS, type Settings } from '$shared/alerts.mjs';
import { sql } from './db';

export async function getSettings(): Promise<Settings> {
	const [row] = await sql<{ v: Partial<Settings> }[]>`SELECT v FROM settings WHERE k = 'app'`;
	return { ...DEFAULT_SETTINGS, ...(row?.v ?? {}) };
}

/** Merges a patch into the stored blob — sections of the settings page save independently. */
export async function saveSettings(patch: Partial<Settings>) {
	await sql`
		INSERT INTO settings (k, v) VALUES ('app', ${sql.json(patch)})
		ON CONFLICT (k) DO UPDATE SET v = settings.v || excluded.v`;
}

export function redactSettings(s: Settings) {
	return { ...s, smtpPass: s.smtpPass ? '********' : '' };
}

export const SMTP_PASS_UNCHANGED = '********';
