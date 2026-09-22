import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { ensureMember, parseOwners } from '$lib/server/access';
import { PASS_COOKIE, PASS_LIFE, readTicket, signPass } from '$lib/server/ticket';
import type { RequestHandler } from './$types';

/**
 * `GET /auth/sso?t=<ticket>` — the far end of the hub's handshake.
 *
 * `dirac.davis9001.dev/apollo` is a 302 into the hub's `/sso?aud=apollo`; the
 * hub signs the person in with Discord (which it already does for every other
 * service), mints a 60-second ticket, and sends them here. This route spends
 * it and issues a pass of this app's own.
 *
 * **Who gets in.** David, 2026-09-19: *"we can make it so anyone with access
 * to the Apollo discord server can see that."* Reaching the hub already means
 * a Discord identity it recognises, so anybody who arrives with a good ticket
 * becomes a **member row** — `guest` unless the Worker names them an owner.
 * A guest is not "sees everything": `access.ts` gives a guest only the
 * projects they hold a grant on, so signing in and being shown nothing is the
 * correct outcome until David grants something. That is deliberate. The board
 * carries a client's money and orders, and *may sign in* and *may read Jay's
 * numbers* are two different permissions.
 */
export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	const token = url.searchParams.get('t') ?? '';
	const secret = env.DIRAC_SSO_SECRET ?? '';
	const read = await readTicket(token, secret);
	if (!read.ok) {
		// The reason goes to the log, never to the page: a message naming the
		// failed check is a message that helps somebody tune a forgery.
		console.warn(`[sso] refused a ticket: ${read.why}`);
		throw redirect(303, '/board?sso=refused');
	}
	const { ticket } = read;

	// Spent once. The hub gives a ticket sixty seconds and a `jti`; holding
	// the jti for its remaining life is all a replay guard has to do, and KV
	// with a TTL is exactly that shape. If KV is not bound the ticket still
	// works — an expiry of sixty seconds is the floor of this defence, and
	// refusing every login because the replay store is missing would be a
	// worse failure than the one it prevents.
	const kv = (platform?.env as Record<string, unknown> | undefined)?.APOLLO_SNAPSHOT as
		| {
				get(k: string): Promise<string | null>;
				put(k: string, v: string, o?: unknown): Promise<void>;
		  }
		| undefined;
	if (kv?.get) {
		const key = `sso:${ticket.jti}`;
		if (await kv.get(key)) {
			console.warn('[sso] refused a ticket already spent');
			throw redirect(303, '/board?sso=refused');
		}
		// Past its own expiry by a margin, so the row outlives the ticket.
		await kv.put(key, '1', { expirationTtl: 120 });
	}

	const db = (platform?.env as Record<string, unknown> | undefined)?.DB as D1Database | undefined;
	const id = `discord:${ticket.sub}`;
	if (db) {
		await ensureMember(db, id, ticket.who || ticket.sub, null, parseOwners(env.APOLLO_OWNER));
	}

	const exp = Math.floor(Date.now() / 1000) + PASS_LIFE;
	const pass = await signPass({ id, name: ticket.who || ticket.sub, exp }, env.AUTH_SECRET ?? '');
	cookies.set(PASS_COOKIE, pass, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: PASS_LIFE
	});
	// The hub sends the path back as `r`, and validates it there. It is
	// validated again here anyway: an open redirect on the far end is an open
	// redirect, whoever else checked it first, and this route is reachable
	// with any query somebody cares to type.
	const back = url.searchParams.get('r') ?? '/board';
	const to = back.startsWith('/') && !back.startsWith('//') ? back : '/board';
	throw redirect(303, to === '/' ? '/board' : to);
};
