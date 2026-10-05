import type { PageLoad } from './$types';
import type { Board } from '$lib/board';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/board');
		if (!res.ok) return { board: null, error: `the board answered ${res.status}` };
		return { board: (await res.json()) as Board, error: null };
	} catch (e) {
		return { board: null, error: e instanceof Error ? e.message : String(e) };
	}
};
