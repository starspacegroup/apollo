import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { ensureMember, grantsOf, mayAsk, parseOwners, sessionMemberId } from '$lib/server/access';
import { RELAY_TICKET_LIFE, signRelayTicket } from '$lib/server/relayTicket';

/**
 * A ticket for the voice relay, for a project the viewer may speak in. Under
 * `/api/activity/`, which the gate leaves open for the token exchange, so the
 * pass is read here: no pass, no ticket.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	let id = '';
	let name = '';
	try {
		const session = await locals.auth?.();
		id = sessionMemberId(session?.user) ?? '';
		name = session?.user?.username ?? session?.user?.name ?? id;
	} catch {
		/* not signed in */
	}
	if (!id) return json({ error: 'sign in first' }, { status: 401 });
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'no database' }, { status: 503 });
	const { project } = (await request.json().catch(() => ({}))) as { project?: string };
	if (!project) return json({ error: 'a ticket names a project' }, { status: 400 });
	const member = await ensureMember(db, id, name, null, parseOwners(env.APOLLO_OWNER));
	const no = mayAsk('room.say', { project }, member.role, await grantsOf(db, id));
	if (no) return json({ error: no }, { status: 403 });
	const ticket = await signRelayTicket(
		{
			project,
			id,
			name,
			provenance: member.role === 'owner' ? 'david' : 'outside',
			exp: Math.floor(Date.now() / 1000) + RELAY_TICKET_LIFE
		},
		env.AUTH_SECRET ?? ''
	);
	return json({ ticket });
};
