import type { ActionResult } from '@sveltejs/kit';
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
export function toastErrors() {
	return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
		isUnexpectedError(result);
		await update();
	};
}
