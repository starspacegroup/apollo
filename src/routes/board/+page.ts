import type { PageLoad } from './$types';
import { emptyBoard, type Board } from '$lib/board';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/board');
		if (res.status === 401) {
			return { board: emptyBoard('Sign in to see the board.'), signedOut: true };
		}
		const board = (await res.json()) as Board;
		return { board, signedOut: false };
	} catch (e) {
		return {
			board: emptyBoard(`Could not read the board: ${e instanceof Error ? e.message : String(e)}`),
			signedOut: false
		};
	}
};
