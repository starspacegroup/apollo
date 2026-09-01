/**
 * The daemon's end of the wire, on the Worker side.
 *
 * plans/dirac-bridge.md §4.5: the daemon's credential is scoped to Apollo and
 * to reporting. It is not a GitHub token and not a Cloudflare token. This file
 * is where that scoping is real: a request carrying the link token can push a
 * snapshot, read pending intents and acknowledge them. It cannot read a chat
 * session, cannot reach GitHub, and cannot create an intent — the machine does
 * not get to ask itself for work.
 */

/** Constant-time compare, so a wrong token cannot be found a byte at a time. */
function sameSecret(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export interface LinkEnv {
	DB?: D1Database;
	APOLLO_SNAPSHOT?: KVNamespace;
	APOLLO_LINK_TOKEN?: string;
}

/**
 * Authorise a request from the local half.
 *
 * Returns null when it is good, or the Response to send back when it is not.
 * A Worker with no token configured refuses everything: an unset secret must
 * never be an open door, and this is exactly the case where "fail open" would
 * be invisible until somebody found it.
 */
export function authorise(request: Request, env: LinkEnv): Response | null {
	const want = env.APOLLO_LINK_TOKEN;
	if (!want) {
		return new Response(
			JSON.stringify({
				error:
					'no APOLLO_LINK_TOKEN is set on this Worker, so the link is closed. `wrangler secret put APOLLO_LINK_TOKEN`.'
			}),
			{ status: 503, headers: { 'content-type': 'application/json' } }
		);
	}
	const got = request.headers.get('authorization') ?? '';
	const bearer = got.startsWith('Bearer ') ? got.slice(7).trim() : '';
	if (!bearer || !sameSecret(bearer, want)) {
		return new Response(JSON.stringify({ error: 'unauthorised' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}
	return null;
}

/** How long an intent nobody collected stays interesting. */
export const INTENT_TTL_SECONDS = 24 * 60 * 60;

export interface Intent {
	id: string;
	kind: string;
	payload: Record<string, unknown>;
	created_at: number;
	created_by: string;
	state: string;
	detail: string | null;
}

/**
 * The kinds a browser may create.
 *
 * Deliberately short, and deliberately missing the interesting one. There is no
 * `run` here and there never will be: the local conductor decides what runs.
 * `work.request` is how a card gets moved into flight — it asks, and the answer
 * comes back through the next snapshot.
 */
export const ALLOWED_INTENTS = ['pause', 'work.request', 'attention.resolve'] as const;
export type IntentKind = (typeof ALLOWED_INTENTS)[number];

export function isAllowed(kind: string): kind is IntentKind {
	return (ALLOWED_INTENTS as readonly string[]).includes(kind);
}

export async function createIntent(
	db: D1Database,
	kind: string,
	payload: Record<string, unknown>,
	createdBy: string
): Promise<Intent> {
	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`INSERT INTO intents (id, kind, payload, created_at, created_by, state)
			 VALUES (?, ?, ?, ?, ?, 'pending')`
		)
		.bind(id, kind, JSON.stringify(payload), now, createdBy)
		.run();
	return { id, kind, payload, created_at: now, created_by: createdBy, state: 'pending', detail: null };
}

/**
 * Intents the daemon has not settled yet, and mark them delivered.
 *
 * Delivery is recorded but is not settlement. The daemon says what actually
 * happened in its ack, and until it does the browser shows the card as asked
 * rather than as done — which is the honest state, because on this machine the
 * request may still be refused by the dial, the gate or the quota.
 */
export async function takeIntents(db: D1Database, limit = 25): Promise<Intent[]> {
	const cutoff = Math.floor(Date.now() / 1000) - INTENT_TTL_SECONDS;
	await db
		.prepare(
			`UPDATE intents SET state='expired', settled_at=unixepoch(),
			 detail='nobody collected it within a day'
			 WHERE state IN ('pending','delivered') AND created_at < ?`
		)
		.bind(cutoff)
		.run();

	const { results } = await db
		.prepare(
			`SELECT id, kind, payload, created_at, created_by, state, detail
			 FROM intents WHERE state='pending' ORDER BY created_at LIMIT ?`
		)
		.bind(limit)
		.all<{
			id: string;
			kind: string;
			payload: string;
			created_at: number;
			created_by: string;
			state: string;
			detail: string | null;
		}>();

	const out: Intent[] = [];
	for (const r of results ?? []) {
		await db
			.prepare(`UPDATE intents SET state='delivered', delivered_at=unixepoch() WHERE id=?`)
			.bind(r.id)
			.run();
		out.push({ ...r, payload: JSON.parse(r.payload), state: 'delivered' });
	}
	return out;
}

export async function settleIntent(
	db: D1Database,
	id: string,
	ok: boolean,
	detail: string
): Promise<void> {
	await db
		.prepare(
			`UPDATE intents SET state=?, settled_at=unixepoch(), detail=? WHERE id=?`
		)
		.bind(ok ? 'applied' : 'refused', detail.slice(0, 500), id)
		.run();
}

export async function recentIntents(db: D1Database, limit = 20): Promise<Intent[]> {
	const { results } = await db
		.prepare(
			`SELECT id, kind, payload, created_at, created_by, state, detail
			 FROM intents ORDER BY created_at DESC LIMIT ?`
		)
		.bind(limit)
		.all<{
			id: string;
			kind: string;
			payload: string;
			created_at: number;
			created_by: string;
			state: string;
			detail: string | null;
		}>();
	return (results ?? []).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}
