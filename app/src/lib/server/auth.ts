import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import { sql } from './db';

const scryptAsync = promisify(scrypt) as (
	pw: string,
	salt: Buffer,
	len: number
) => Promise<Buffer>;

const COOKIE = 'sm_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// HMAC-signed cookie instead of a sessions table — this is a single-user self-hosted
// tool, so "log everyone out" is "rotate SESSION_SECRET". If it ever grows multi-user
// or needs per-device revocation, that is when a session table earns its keep.
const secret =
	env.SESSION_SECRET ||
	(() => {
		console.warn('SESSION_SECRET not set — generating an ephemeral one (restarts log you out)');
		return randomBytes(32).toString('hex');
	})();

const signature = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

export async function hashPassword(password: string) {
	const salt = randomBytes(16);
	const key = await scryptAsync(password, salt, 64);
	return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [saltHex, keyHex] = stored.split(':');
	if (!saltHex || !keyHex) return false;
	const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64);
	const expected = Buffer.from(keyHex, 'hex');
	return key.length === expected.length && timingSafeEqual(key, expected);
}

export function createSession(cookies: Cookies) {
	const expires = Date.now() + SESSION_MS;
	cookies.set(COOKIE, `${expires}.${signature(String(expires))}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !env.INSECURE_COOKIES,
		maxAge: SESSION_MS / 1000
	});
}

export function destroySession(cookies: Cookies) {
	cookies.delete(COOKIE, { path: '/' });
}

export async function readSession(cookies: Cookies) {
	const raw = cookies.get(COOKIE);
	if (!raw) return null;

	const [expires, sig] = raw.split('.');
	if (!expires || !sig) return null;

	const expected = signature(expires);
	// Compare in constant time, and only after confirming equal length.
	if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
		return null;
	if (Number(expires) < Date.now()) return null;

	const [user] = await sql<{ email: string }[]>`SELECT email FROM app_user WHERE id = 1`;
	return user ?? null;
}

/** No account yet — /login offers to create the first one instead of signing in. */
export async function needsSetup() {
	const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM app_user`;
	return row.n === 0;
}
