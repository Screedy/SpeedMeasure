import { defineEnvVars } from '@sveltejs/kit/env';

// All optional: each reader supplies its own fallback.
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	DATABASE_URL: { schema: optional },
	SESSION_SECRET: { schema: optional },
	INSECURE_COOKIES: { schema: optional }
});
