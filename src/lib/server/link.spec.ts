import { describe, it, expect } from 'vitest';
import { authorise, isAllowed, ALLOWED_INTENTS } from './link';

function req(auth?: string): Request {
	return new Request('https://apollo.test/api/link/intents', {
		headers: auth ? { authorization: auth } : {}
	});
}

describe('the link token', () => {
	it('refuses everything when no token is configured', async () => {
		// The case that would be invisible: an unset secret must never be an
		// open door.
		const r = authorise(req('Bearer anything'), {});
		expect(r?.status).toBe(503);
		expect(await r!.json()).toMatchObject({ error: expect.stringContaining('APOLLO_LINK_TOKEN') });
	});

	it('refuses a missing, malformed or wrong bearer', () => {
		const env = { APOLLO_LINK_TOKEN: 'correct-horse' };
		expect(authorise(req(), env)?.status).toBe(401);
		expect(authorise(req('correct-horse'), env)?.status).toBe(401);
		expect(authorise(req('Bearer wrong'), env)?.status).toBe(401);
		expect(authorise(req('Bearer correct-hors'), env)?.status).toBe(401);
		expect(authorise(req('Bearer correct-horsee'), env)?.status).toBe(401);
	});

	it('accepts the right one', () => {
		expect(
			authorise(req('Bearer correct-horse'), { APOLLO_LINK_TOKEN: 'correct-horse' })
		).toBeNull();
	});
});

describe('what the hosted half may ask for', () => {
	it('has no way to start a run', () => {
		// plans/dirac-bridge.md §4: Apollo may request work, it may never
		// authorise it. If this test ever needs changing, the decision to
		// authorise has moved off David's machine and onto a Worker.
		expect(isAllowed('run')).toBe(false);
		expect(isAllowed('start')).toBe(false);
		expect(isAllowed('exec')).toBe(false);
		expect(ALLOWED_INTENTS).not.toContain('run');
	});

	it('may stop the machine and may ask it for work', () => {
		expect(isAllowed('pause')).toBe(true);
		expect(isAllowed('work.request')).toBe(true);
		expect(isAllowed('attention.resolve')).toBe(true);
	});

	it('cannot resume, because un-pausing is authorising', () => {
		expect(isAllowed('resume')).toBe(false);
		expect(isAllowed('autonomy')).toBe(false);
	});
});
