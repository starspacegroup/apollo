import { json } from '@sveltejs/kit';
import { authorise, type LinkEnv } from '$lib/server/link';
import type { RequestHandler } from './$types';

/** Keep the whole board in the trail at most this often. */
const BODY_EVERY_S = 3600;
/** Blank trail bodies older than this. Counts are kept. */
const BODY_KEEP_S = 7 * 86400;

/**
 * The local half pushes what is true. This is `plans/dirac-bridge.md` §6.2 —
 * "register and heartbeat, most of the value and none of the risk".
 *
 * It is a push rather than a pull because of §1: the machine is behind NAT on a
 * residential connection and sometimes asleep. When it stops pushing, the board
 * goes stale and says so, and every actor on it is offline — which is correct
 * rather than a failure. A board that hides the gap would be lying about a
 * sleeping desk.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = (platform?.env ?? {}) as LinkEnv;
	const no = authorise(request, env);
	if (no) return no;

	const body = await request.text();
	if (body.length > 2_000_000) {
		return json({ error: 'snapshot too large' }, { status: 413 });
	}
	/**
	 * A count, whatever shape the field arrived in.
	 *
	 * `Number([{…}])` is NaN, which binds as NULL and trips a NOT NULL column —
	 * which is exactly what happened the first time `attention` went from being
	 * a count to being a list. The two halves of this system version
	 * independently, so the reader has to survive a field changing shape
	 * without failing the whole push.
	 */
	const count = (v: unknown): number =>
		Array.isArray(v) ? v.length : Number.isFinite(Number(v)) ? Number(v) : 0;

	let board: Record<string, unknown>;
	try {
		board = JSON.parse(body);
	} catch {
		return json({ error: 'not JSON' }, { status: 400 });
	}

	// KV is the hot read the board page uses.
	if (env.APOLLO_SNAPSHOT) {
		await env.APOLLO_SNAPSHOT.put('board', body);
	}

	/**
	 * D1 is the trail. Counts are extracted here so a trend is a SQL query
	 * rather than a JSON parse per row.
	 *
	 * Counts go in on every push; the whole body goes in at most once an hour,
	 * and bodies older than a week are blanked (migrations/0003). Storing the
	 * full body every minute filled D1's 10 GB ceiling on 2026-10-12 and turned
	 * every push into a 500.
	 *
	 * A trail failure does not fail the push. KV already holds the current
	 * board, which is what the push is for; the trail is history. The error is
	 * logged and named in the reply, so it is seen, not swallowed.
	 */
	let trail_error: string | undefined;
	if (env.DB) {
		const actors = Array.isArray(board.actors) ? (board.actors as { state?: string }[]) : [];
		const projects = Array.isArray(board.projects) ? board.projects : [];
		try {
			await env.DB.batch([
				env.DB.prepare(
					`INSERT INTO snapshots
					   (machine, generated_at, received_at, projects, actors, running, attention, autonomy, gate_ok, body)
					 VALUES (?, ?, unixepoch(), ?, ?, ?, ?, ?, ?,
					   CASE WHEN EXISTS (SELECT 1 FROM snapshots
					                      WHERE body != '' AND received_at > unixepoch() - ?)
					        THEN '' ELSE ? END)`
				).bind(
					String(board.machine ?? 'unknown'),
					Math.floor(Date.parse(String(board.generated_at ?? '')) / 1000) ||
						Math.floor(Date.now() / 1000),
					projects.length,
					actors.length,
					actors.filter((a) => a.state === 'working').length,
					count(board.attention),
					String((board as { autonomy?: string }).autonomy ?? 'unknown'),
					(board as { gate_ok?: boolean }).gate_ok ? 1 : 0,
					BODY_EVERY_S,
					body
				),
				env.DB.prepare(
					`UPDATE snapshots SET body = '' WHERE body != '' AND received_at < unixepoch() - ?`
				).bind(BODY_KEEP_S)
			]);
		} catch (e) {
			trail_error = e instanceof Error ? e.message : String(e);
			console.error('snapshot trail write failed:', trail_error);
		}
	}

	return json({
		ok: true,
		stored: { kv: !!env.APOLLO_SNAPSHOT, d1: !!env.DB && !trail_error },
		...(trail_error ? { trail_error } : {})
	});
};
