import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { emptyBoard, type Board } from '$lib/board';
import type { RequestHandler } from './$types';

/**
 * The board snapshot, written by `apollo export --out ~/.local/share/apollo/board.json`.
 *
 * There is deliberately no live connection here. plans/dirac-bridge.md §1: the
 * agents are on a desktop behind NAT, and nothing on the public internet can
 * reach them. A snapshot the local half pushes is the honest shape until the
 * outbound socket in that plan exists — and when it does, only this file
 * changes.
 */
export const GET: RequestHandler = async ({ platform }) => {
	// Cloudflare first, if a snapshot has ever been put there.
	const kv = (platform?.env as Record<string, unknown> | undefined)?.APOLLO_SNAPSHOT;
	if (kv && typeof (kv as { get?: unknown }).get === 'function') {
		const text = await (kv as { get: (k: string, t: string) => Promise<string | null> }).get(
			'board',
			'text'
		);
		if (text) return json(JSON.parse(text) as Board);
	}

	// Local development reads the file the CLI writes. A Worker has no
	// filesystem, so this import is guarded rather than assumed.
	if (dev) {
		try {
			const { readFile } = await import('node:fs/promises');
			const { homedir } = await import('node:os');
			const path =
				process.env.APOLLO_SNAPSHOT ?? `${homedir()}/.local/share/apollo/board.json`;
			const text = await readFile(path, 'utf8');
			return json(JSON.parse(text) as Board);
		} catch (e) {
			return json(
				emptyBoard(
					`No snapshot on this machine yet. Run \`apollo export --out ~/.local/share/apollo/board.json\`. (${
						e instanceof Error ? e.message : String(e)
					})`
				)
			);
		}
	}

	return json(
		emptyBoard(
			'No register is bound to this Worker yet. The local half pushes a snapshot; until the bridge in plans/dirac-bridge.md exists, the hosted board has nothing true to show — and showing nothing is the correct answer rather than a demo.'
		)
	);
};
