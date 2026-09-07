import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { emptyBoard, type Board } from '$lib/board';
import {
	ensureMember,
	grantsOf,
	parseOwners,
	sessionMemberId,
	viewerOf,
	visibleBoard
} from '$lib/server/access';
import type { RequestHandler } from './$types';

/**
 * The board snapshot, written by `apollo export --out ~/.local/share/apollo/board.json`.
 *
 * There is deliberately no live connection here. plans/dirac-bridge.md §1: the
 * agents are on a desktop behind NAT, and nothing on the public internet can
 * reach them. A snapshot the local half pushes is the honest shape until the
 * outbound socket in that plan exists — and when it does, only this file
 * changes.
 *
 * Since 2026-09-07 the board is read as somebody: a sign-in is required, and
 * what comes back is what that person may see (`access.ts`). The owner and an
 * admin get the board whole; a guest gets their projects and nothing about
 * the others.
 */
async function whole(platform: App.Platform | undefined): Promise<Board> {
	// Cloudflare first, if a snapshot has ever been put there.
	const kv = (platform?.env as Record<string, unknown> | undefined)?.APOLLO_SNAPSHOT;
	if (kv && typeof (kv as { get?: unknown }).get === 'function') {
		const text = await (kv as { get: (k: string, t: string) => Promise<string | null> }).get(
			'board',
			'text'
		);
		if (text) return JSON.parse(text) as Board;
	}

	// Local development reads the file the CLI writes. A Worker has no
	// filesystem, so this import is guarded rather than assumed.
	if (dev) {
		try {
			const { readFile } = await import('node:fs/promises');
			const { homedir } = await import('node:os');
			const path = process.env.APOLLO_SNAPSHOT ?? `${homedir()}/.local/share/apollo/board.json`;
			const text = await readFile(path, 'utf8');
			return JSON.parse(text) as Board;
		} catch (e) {
			return emptyBoard(
				`No snapshot on this machine yet. Run \`apollo export --out ~/.local/share/apollo/board.json\`. (${
					e instanceof Error ? e.message : String(e)
				})`
			);
		}
	}

	return emptyBoard(
		'No register is bound to this Worker yet. The local half pushes a snapshot; until the bridge in plans/dirac-bridge.md exists, the hosted board has nothing true to show — and showing nothing is the correct answer rather than a demo.'
	);
}

export const GET: RequestHandler = async ({ platform, locals }) => {
	let user: App.Session['user'] | undefined;
	try {
		user = (await locals.auth?.())?.user;
	} catch {
		user = undefined;
	}
	const id = sessionMemberId(user);
	if (!id) return json({ error: 'sign in first' }, { status: 401 });

	const board = await whole(platform);
	const env = (platform?.env ?? {}) as { DB?: D1Database; APOLLO_OWNER?: string };
	if (!env.DB) {
		// No database: local development, where the person at the keyboard is
		// the owner. A deployed Worker without D1 cannot tell anyone apart and
		// says so rather than guessing.
		if (dev) {
			return json({
				...board,
				viewer: {
					id,
					name: user?.username ?? user?.name ?? id,
					avatar: user?.image ?? null,
					role: 'owner',
					projects: Object.fromEntries(board.projects.map((p) => [p.name, 'manager'])),
					everywhere: 'manager'
				}
			});
		}
		return json(
			{ error: 'no database is bound to this Worker, so nobody can be told apart' },
			{ status: 503 }
		);
	}
	const member = await ensureMember(
		env.DB,
		id,
		user?.username ?? user?.name ?? id,
		user?.image ?? null,
		parseOwners(env.APOLLO_OWNER)
	);
	const grants = await grantsOf(env.DB, id);
	return json(visibleBoard(board, viewerOf(member, grants, board)));
};
