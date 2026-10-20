import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { readSession } from '#lib/server/auth.ts';

const handleParaglide: Handle = ({ event, resolve }) =>
	// No URL strategy, so the middleware's request is just a clone; keep event.request (read-only in Kit 3).
	paraglideMiddleware(event.request, ({ locale }) =>
		resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
		})
	);

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
