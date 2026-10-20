import type { ActionResult } from '$app/forms';
import { pushToast } from './toast.svelte';
import { m } from './paraglide/messages';

/** Anything other than 'success' | 'failure' | 'redirect' is unexpected — the request
 * never reached the action at all (thrown exception, or SvelteKit's CSRF check
 * rejecting a mismatched Origin). */
export function isUnexpectedError(result: ActionResult): boolean {
	if (result.type === 'success' || result.type === 'failure' || result.type === 'redirect') {
		return false;
	}
	pushToast(m.error_unexpected());
	return true;
}
/** Every form here posts to a same-page `?/action`, and since SvelteKit 3 the default
 * `update()` then navigates to that action URL — which carries no query string, so it
 * silently dropped the page's own state (log sort/page/search, iperf `?run=`/history
 * page). `navigate: false` applies the result in place instead; redirects still win. */
export const STAY = { navigate: false } as const;

export function toastErrors() {
	return async ({
		result,
		update
	}: {
		result: ActionResult;
		update: (opts?: { navigate?: boolean }) => Promise<void>;
	}) => {
		isUnexpectedError(result);
		await update(STAY);
	};
}
