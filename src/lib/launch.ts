import type { Board } from '$lib/board';

/**
 * Where an Activity launched in a channel should open.
 *
 * The channel the SDK reports is looked up in the snapshot's map: a project's
 * voice channel opens that project; one of its text channels opens that
 * project on that room when the room is a sub-channel. Anything else — a DM,
 * the front door, a channel Apollo does not own — opens the picker.
 */
export function landing(board: Pick<Board, 'discord'>, channelId: string | null): string | null {
	if (!channelId) return null;
	const hit = board.discord?.channels.find((c) => c.id === channelId);
	if (!hit) return null;
	const room = hit.room && hit.room !== hit.project ? `?room=${encodeURIComponent(hit.room)}` : '';
	return `/activity/${encodeURIComponent(hit.project)}${room}`;
}
