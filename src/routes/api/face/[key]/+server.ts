import type { RequestHandler } from './$types';

/**
 * A face, as the local half pushed it. Behind the owner gate like every
 * other read: some faces are pictures David chose, not drawn robots.
 *
 * The key carries the image's fingerprint, so a face that changed is a new
 * URL and this one may be cached for a day.
 */
export const GET: RequestHandler = async ({ params, platform }) => {
	const kv = (platform?.env as { APOLLO_SNAPSHOT?: KVNamespace } | undefined)?.APOLLO_SNAPSHOT;
	if (!kv) return new Response('no store', { status: 503 });
	if (!/^[a-z0-9-]{1,120}\.[0-9a-f]{1,16}$/.test(params.key)) {
		return new Response('no such face', { status: 404 });
	}
	const data = await kv.get(`face:${params.key}`, 'text');
	if (!data) return new Response('no such face', { status: 404 });
	const comma = data.indexOf(',');
	const type = data.slice(5, data.indexOf(';'));
	const bytes = Uint8Array.from(atob(data.slice(comma + 1)), (c) => c.charCodeAt(0));
	return new Response(bytes, {
		headers: {
			'content-type': type,
			'cache-control': 'private, max-age=86400',
			'x-content-type-options': 'nosniff'
		}
	});
};
