// adapter-node 6 dropped the ORIGIN env var: the origin is now either baked in at build
// time (no good for a prebuilt image — every install has its own URL) or read from the
// request headers with the protocol defaulting to https, so a plain-HTTP install failed
// every form POST on SvelteKit's CSRF check. Restore ORIGIN by stamping it onto each
// request as the headers adapter-node reads. Overwriting them also means a client can't
// spoof its way past the check by sending them itself.
import http from 'node:http';
import process from 'node:process';

const origin = process.env.ORIGIN ? new URL(process.env.ORIGIN) : null;

if (origin) {
	// Must be set before the import below: handler.js reads them at module load.
	process.env.PROTOCOL_HEADER = 'x-origin-proto';
	process.env.HOST_HEADER = 'x-origin-host';
}

// Not a string literal on purpose: svelte-check would otherwise resolve into the generated
// build/ (missing before `vite build`, full of untyped code after it).
const entry = './build/handler.js';
const { handler } = await import(entry);

http
	.createServer((req, res) => {
		if (origin) {
			req.headers['x-origin-proto'] = origin.protocol.slice(0, -1);
			req.headers['x-origin-host'] = origin.host;
		}
		handler(req, res, () => {
			res.statusCode = 404;
			res.end();
		});
	})
	.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () =>
		console.log(`Listening on http://0.0.0.0:${process.env.PORT ?? 3000}`)
	);
