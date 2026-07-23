import type { RequestHandler } from './$types';
import { streamCsv } from '$lib/server/data';

const HEADER =
	'timestamp_iso,provider,server,download_mbps,upload_mbps,ping_ms,jitter_ms,packet_loss_pct\n';

const quote = (v: unknown) => (v == null ? '' : `"${String(v).replaceAll('"', '""')}"`);

export const GET: RequestHandler = async ({ url }) => {
	const to = new Date(Number(url.searchParams.get('to')) || Date.now());
	const from = new Date(Number(url.searchParams.get('from')) || +to - 864e5);

	// Streamed from a server-side cursor: an export of five years must not have to fit in RAM.
	const body = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			controller.enqueue(encoder.encode(HEADER));
			try {
				for await (const chunk of streamCsv(from, to)) {
					const lines = chunk
						.map((r) =>
							[
								r.time.toISOString(),
								r.provider,
								quote(r.server),
								r.download_mbps,
								r.upload_mbps,
								r.ping_ms,
								r.jitter_ms,
								r.loss_pct
							].join(',')
						)
						.join('\n');
					controller.enqueue(encoder.encode(lines + '\n'));
				}
				controller.close();
			} catch (err) {
				controller.error(err);
			}
		}
	});

	return new Response(body, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="speedmeasure-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`
		}
	});
};
