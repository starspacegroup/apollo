import { json } from '@sveltejs/kit';
import { authorise, type LinkEnv } from '$lib/server/link';
import type { RequestHandler } from './$types';

/**
 * The local half pushes the faces the rooms wear, each once per change.
 *
 * A snapshot names a face by key and fingerprint; the image arrives here
 * under that key and is served back by `/api/face/<key>`. Kept out of the
 * snapshot because twenty-seven rooms' faces were ten megabytes, and the
 * snapshot is capped at two.
 */
const DATA = /^data:image\/(svg\+xml|png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
const KEY = /^[a-z0-9-]{1,120}\.[0-9a-f]{1,16}$/;

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = (platform?.env ?? {}) as LinkEnv;
	const no = authorise(request, env);
	if (no) return no;
	if (!env.APOLLO_SNAPSHOT) return json({ error: 'no KV is bound' }, { status: 503 });
	const body = await request.text();
	if (body.length > 2_000_000) return json({ error: 'too large' }, { status: 413 });
	let faces: { key?: unknown; data?: unknown }[];
	try {
		faces = (JSON.parse(body) as { faces?: unknown }).faces as typeof faces;
	} catch {
		return json({ error: 'not JSON' }, { status: 400 });
	}
	if (!Array.isArray(faces)) return json({ error: 'faces is a list' }, { status: 400 });
	let stored = 0;
	for (const f of faces) {
		const key = typeof f.key === 'string' ? f.key : '';
		const data = typeof f.data === 'string' ? f.data : '';
		if (!KEY.test(key) || !DATA.test(data)) continue;
		await env.APOLLO_SNAPSHOT.put(`face:${key}`, data);
		stored++;
	}
	return json({ ok: true, stored });
};
