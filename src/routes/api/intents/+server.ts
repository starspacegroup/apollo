import { json } from '@sveltejs/kit';
import { createIntent, isAllowed, recentIntents, ALLOWED_INTENTS } from '$lib/server/link';
import type { RequestHandler } from './$types';

/**
 * The browser's end: a card moved, a fleet paused, an item marked seen.
 *
 * Two rules, both from `plans/dirac-bridge.md` §4.
 *
 * **This creates a request, not an event.** Nothing here changes the machine.
 * It writes down that somebody asked, the daemon collects it, and the local
 * conductor decides — under the autonomy dial, the fleet switches, the trust
 * tier, the gate, the quota and the budget. An intent cannot cause anything
 * David had not already authorised; it can only change which of those things
 * happens next.
 *
 * **The kinds are an allow-list, and there is no `run` in it.** Adding one
 * would move the decision to authorise off David's machine and onto a Worker,
 * which is precisely the line the whole design exists to hold.
 */
/**
 * Who is asking, or null.
 *
 * `locals.auth()` **throws** when the OAuth secrets are not configured, which
 * turned an unauthenticated POST into a 500 carrying "There was a problem with
 * the server configuration". Two things wrong with that: a caller who simply is
 * not signed in gets an error that says the server is broken, and the shape of
 * the server's configuration leaks to anyone who asks. An unauthenticated
 * request is a 401, whatever the reason the session could not be read.
 */
async function whoIsAsking(locals: App.Locals): Promise<string | null> {
	try {
		const session = await locals.auth?.();
		return session?.user?.username ?? session?.user?.email ?? null;
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const who = await whoIsAsking(locals);
	if (!who) return json({ error: 'sign in first' }, { status: 401 });

	const db = (platform?.env as { DB?: D1Database } | undefined)?.DB;
	if (!db) {
		return json(
			{ error: 'no database is bound to this Worker, so nothing can be asked for yet' },
			{ status: 503 }
		);
	}

	const body = (await request.json().catch(() => null)) as {
		kind?: string;
		payload?: Record<string, unknown>;
	} | null;
	const kind = body?.kind ?? '';
	if (!isAllowed(kind)) {
		return json(
			{
				error: `\`${kind}\` is not something the hosted half may ask for. Allowed: ${ALLOWED_INTENTS.join(', ')}. Starting a run is decided on the machine, not here.`
			},
			{ status: 400 }
		);
	}

	// Payloads are bounded and shallow. Whatever the machine does with this, it
	// should never be handed something big enough to be a program.
	const payload = body?.payload ?? {};
	const text = JSON.stringify(payload);
	if (text.length > 2000) return json({ error: 'payload too large' }, { status: 413 });

	const intent = await createIntent(db, kind, payload, who);
	return json({ ok: true, intent });
};

/** What has been asked recently, and what the machine said back. */
export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!(await whoIsAsking(locals))) return json({ error: 'sign in first' }, { status: 401 });
	const db = (platform?.env as { DB?: D1Database } | undefined)?.DB;
	if (!db) return json({ intents: [] });
	return json({ intents: await recentIntents(db) });
};
