import { json } from '@sveltejs/kit';
import { authorise, takeIntents, type LinkEnv } from '$lib/server/link';
import type { RequestHandler } from './$types';

/**
 * What has been asked for, for the daemon to collect.
 *
 * Read-only from the machine's point of view, and that is the whole security
 * posture of this endpoint: the worst a compromised Apollo can do here is hand
 * the daemon a *question* — a project name and a character handle. There is no
 * payload to execute, and `plans/dirac-bridge.md` §4.2 is explicit that this is
 * the point: "A compromised Apollo can then point an agent at the wrong issue —
 * bad, recoverable — rather than hand it a script."
 */
export const GET: RequestHandler = async ({ request, platform }) => {
	const env = (platform?.env ?? {}) as LinkEnv;
	const no = authorise(request, env);
	if (no) return no;
	if (!env.DB) return json({ intents: [] });
	return json({ intents: await takeIntents(env.DB) });
};
