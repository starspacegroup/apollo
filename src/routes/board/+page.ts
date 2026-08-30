import type { PageLoad } from './$types';
import { emptyBoard, type Board } from '$lib/board';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/board');
		const board = (await res.json()) as Board;
		return { board };
	} catch (e) {
		return {
			board: emptyBoard(
				`Could not read the board: ${e instanceof Error ? e.message : String(e)}`
			)
		};
	}
};
