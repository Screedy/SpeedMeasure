/**
 * Popup notifications for unexpected form-action failures (e.g. a CSRF/origin
 * misconfiguration returning a raw 403 instead of the app's normal response)
 */
type Toast = { id: number; message: string };

let nextId = 0;
export const toasts: Toast[] = $state([]);

export function pushToast(message: string) {
	const id = nextId++;
	toasts.push({ id, message });
	setTimeout(() => dismissToast(id), 6000);
}

export function dismissToast(id: number) {
	const i = toasts.findIndex((t) => t.id === id);
	if (i !== -1) toasts.splice(i, 1);
}
