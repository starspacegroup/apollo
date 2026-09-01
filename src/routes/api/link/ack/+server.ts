import { json } from '@sveltejs/kit';
import { authorise, settleIntent, type LinkEnv } from '$lib/server/link';
import type { RequestHandler } from './$types';

/**
 * What the machine did about each intent, in its own words.
 *
 * This is the half that makes a moved card honest. The browser asks; the
 * machine answers; the card shows what the machine said. A refusal — "autonomy
 * is off here", "quiet hours", "the weekly window is at 48% against a 40%
 * ceiling" — reaches the person who asked, rather than the request vanishing
 * into a queue that looks like it worked.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = (platform?.env ?? {}) as LinkEnv;
	const no = authorise(request, env);
	if (no) return no;
	if (!env.DB) return json({ ok: true, settled: 0 });

	const body = (await request.json().catch(() => null)) as {
		acks?: { id?: string; ok?: boolean; detail?: string }[];
	} | null;
	const acks = body?.acks ?? [];
	let n = 0;
	for (const a of acks) {
		if (!a?.id) continue;
		await settleIntent(env.DB, a.id, !!a.ok, String(a.detail ?? ''));
		n++;
	}
	return json({ ok: true, settled: n });
};
