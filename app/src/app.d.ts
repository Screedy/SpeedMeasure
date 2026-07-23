// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts when a valid session cookie is present. */
			user: { email: string } | null;
		}
	}
}

export {};
