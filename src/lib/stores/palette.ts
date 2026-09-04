import { writable } from 'svelte/store';

/**
 * The command palette is the front door.
 *
 * This interface opens on the palette rather than on an empty text box: the
 * first question is "which conversation, or what kind of thing am I doing",
 * and a cursor blinking in a chat box answers neither. ⌘K reopens it from
 * anywhere, Escape puts it away.
 */
export const paletteOpen = writable(false);

/**
 * What the palette can reach into the chat and do.
 *
 * The chat registers these when it mounts and clears them when it goes. The
 * palette shows a command only while its action exists, so a verb is never
 * offered by a window that cannot perform it — a palette listing "take a
 * photo" with nothing behind it is worse than one that does not.
 */
export type PaletteActions = {
	attach?: () => void;
	camera?: () => void;
	voice?: () => void;
	changeRepo?: () => void;
};

export const paletteActions = writable<PaletteActions>({});

/** Register the chat's abilities, and get the undo. */
export function registerPaletteActions(actions: PaletteActions): () => void {
	paletteActions.update((prev) => ({ ...prev, ...actions }));
	return () => {
		paletteActions.update((prev) => {
			const next = { ...prev };
			for (const key of Object.keys(actions) as Array<keyof PaletteActions>) {
				delete next[key];
			}
			return next;
		});
	};
}
