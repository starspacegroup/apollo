/**
 * Helpers for tracking which OpenAI Realtime response the client is currently
 * streaming.
 *
 * The client filters streaming deltas with `data.response_id === currentResponseId`.
 * That filter is only correct if `currentResponseId` is cleared by the terminal
 * event (`response.done` / `response.cancelled`) belonging to the *same* response.
 *
 * When a text message is sent while an earlier response is still in flight, the
 * client cancels the old response and immediately requests a new one. The
 * terminal event for the cancelled response can arrive *after* `response.created`
 * for the new one. Clearing state unconditionally at that point wipes out the new
 * response id, so every subsequent delta is filtered out and the user sees no
 * reply at all — with no error shown.
 */

/**
 * Decide whether a terminal response event should clear the tracked response state.
 *
 * Returns `false` only when the event is provably about a different (stale)
 * response than the one currently being tracked.
 *
 * @param eventResponseId `response.id` carried by the terminal event, if any.
 * @param currentResponseId The response id the client is currently tracking.
 */
export function shouldClearResponseState(
	eventResponseId: string | null | undefined,
	currentResponseId: string | null
): boolean {
	// Nothing is being tracked, so clearing is a no-op and always safe.
	if (currentResponseId === null) return true;

	// Untagged terminal event (e.g. a top-level `error`): we cannot attribute it,
	// so fall back to clearing rather than risk getting stuck mid-response.
	if (eventResponseId === null || eventResponseId === undefined) return true;

	return eventResponseId === currentResponseId;
}
