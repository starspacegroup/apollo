import { describe, it, expect } from 'vitest';
import { shouldClearResponseState } from './realtimeResponseState';

describe('shouldClearResponseState', () => {
	it('clears when the terminal event belongs to the tracked response', () => {
		expect(shouldClearResponseState('resp_b', 'resp_b')).toBe(true);
	});

	it('does not clear when a stale response terminates after a newer one started', () => {
		// resp_a was cancelled, resp_b is now streaming: resp_a's `response.done`
		// must not wipe out resp_b's id.
		expect(shouldClearResponseState('resp_a', 'resp_b')).toBe(false);
	});

	it('clears when nothing is being tracked', () => {
		expect(shouldClearResponseState('resp_a', null)).toBe(true);
	});

	it('clears for untagged terminal events so the client cannot get stuck', () => {
		expect(shouldClearResponseState(undefined, 'resp_b')).toBe(true);
		expect(shouldClearResponseState(null, 'resp_b')).toBe(true);
	});

	it('keeps deltas for the new response addressable after a stale terminal event', () => {
		// Regression for issue #9: a text message sent while a response is in
		// flight produced no reply at all.
		let currentResponseId: string | null = null;
		let processingResponse = false;

		const onResponseCreated = (id: string) => {
			currentResponseId = id;
			processingResponse = true;
		};
		const onResponseTerminal = (id: string | null | undefined) => {
			if (!shouldClearResponseState(id, currentResponseId)) return;
			currentResponseId = null;
			processingResponse = false;
		};

		onResponseCreated('resp_a'); // first response starts
		onResponseCreated('resp_b'); // user sends text; resp_a cancelled, resp_b starts
		onResponseTerminal('resp_a'); // late terminal event for the cancelled response

		expect(currentResponseId).toBe('resp_b');
		expect(processingResponse).toBe(true);

		onResponseTerminal('resp_b');

		expect(currentResponseId).toBe(null);
		expect(processingResponse).toBe(false);
	});
});
