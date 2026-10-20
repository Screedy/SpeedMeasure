import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';

// No top-level throw: SvelteKit imports server modules during `vite build` to analyse
// routes, and there is no env there. postgres.js connects lazily, so a missing or wrong
// URL surfaces as a connection error on the first query instead — and compose already
// makes DATABASE_URL required.
export const sql = postgres(DATABASE_URL ?? '', { onnotice: () => {} });
