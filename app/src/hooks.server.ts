import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { readSession } from '$lib/server/auth';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

const PUBLIC_ROUTES = ['/login'];

/** Deny by default: every route needs a session unless it is explicitly public. */
const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = await readSession(event.cookies);

	if (!event.locals.user && !PUBLIC_ROUTES.includes(event.url.pathname)) {
		redirect(303, '/login');
	}

	return resolve(event);
};

export const handle = sequence(handleParaglide, handleAuth);
