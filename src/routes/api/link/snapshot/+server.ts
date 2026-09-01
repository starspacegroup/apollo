import { json } from '@sveltejs/kit';
import { authorise, type LinkEnv } from '$lib/server/link';
import type { RequestHandler } from './$types';

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

	// D1 is the trail. Counts are extracted here so a trend is a SQL query
	// rather than a JSON parse per row.
	if (env.DB) {
		const actors = Array.isArray(board.actors) ? (board.actors as { state?: string }[]) : [];
		const projects = Array.isArray(board.projects) ? board.projects : [];
		await env.DB.prepare(
			`INSERT INTO snapshots
			   (machine, generated_at, received_at, projects, actors, running, attention, autonomy, gate_ok, body)
			 VALUES (?, ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				String(board.machine ?? 'unknown'),
				Math.floor(Date.parse(String(board.generated_at ?? '')) / 1000) || Math.floor(Date.now() / 1000),
				projects.length,
				actors.length,
				actors.filter((a) => a.state === 'working').length,
				count(board.attention),
				String((board as { autonomy?: string }).autonomy ?? 'unknown'),
				(board as { gate_ok?: boolean }).gate_ok ? 1 : 0,
				body
			)
			.run();
	}

	return json({ ok: true, stored: { kv: !!env.APOLLO_SNAPSHOT, d1: !!env.DB } });
};
