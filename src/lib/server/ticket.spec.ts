import { describe, expect, it } from 'vitest';
import { PASS_LIFE, readPass, readTicket, signPass, type Ticket } from './ticket';

const SECRET = 'a-shared-secret-that-is-not-the-session-key';

function b64url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Mint exactly the way `dirac-gate.ts` mints: HMAC-SHA256 over the JSON, the
 * body base64url of that same JSON, joined with a dot.
 *
 * Written out rather than imported, because the hub is a different repository
 * on a different runtime. If its construction ever changes, this test is
 * where the two drift apart loudly instead of at a login nobody can explain.
 */
async function mint(t: Ticket, secret = SECRET): Promise<string> {
	const payload = JSON.stringify(t);
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	return `${b64url(new TextEncoder().encode(payload))}.${b64url(new Uint8Array(mac))}`;
}

const good = (over: Partial<Ticket> = {}): Ticket => ({
	aud: 'apollo',
	who: 'davis9001',
	sub: '293484886726279168',
	exp: 1_000_060,
	jti: '11111111-2222-3333-4444-555555555555',
	...over
});

describe('a ticket from the hub', () => {
	it('is read when the hub signed it', async () => {
		const r = await readTicket(await mint(good()), SECRET, 1_000_000);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.ticket.sub).toBe('293484886726279168');
	});

	it('is refused when anything in it was changed', async () => {
		const token = await mint(good());
		// Flip one character of the body; the signature no longer covers it.
		const dot = token.lastIndexOf('.');
		const body = token.slice(0, dot);
		const tampered = `${body.slice(0, -1)}${body.slice(-1) === 'A' ? 'B' : 'A'}.${token.slice(dot + 1)}`;
		const r = await readTicket(tampered, SECRET, 1_000_000);
		expect(r.ok).toBe(false);
	});

	it('is refused when somebody else signed it', async () => {
		const r = await readTicket(await mint(good(), 'a-different-key'), SECRET, 1_000_000);
		expect(r).toEqual({ ok: false, why: 'bad signature' });
	});

	/** The hub signs for one service at a time; a karaoke ticket is not a key here. */
	it('is refused when it was minted for another service', async () => {
		const r = await readTicket(await mint(good({ aud: 'karaoke' })), SECRET, 1_000_000);
		expect(r).toEqual({ ok: false, why: 'not for this service' });
	});

	it('is refused one second after it expires', async () => {
		const token = await mint(good({ exp: 1_000_000 }));
		expect(await readTicket(token, SECRET, 1_000_000)).toMatchObject({ ok: true });
		expect(await readTicket(token, SECRET, 1_000_001)).toEqual({ ok: false, why: 'expired' });
	});

	/** No secret must never mean no checking. */
	it('is refused when this end has no secret configured', async () => {
		const r = await readTicket(await mint(good()), '', 1_000_000);
		expect(r).toEqual({ ok: false, why: 'no secret configured' });
	});

	it('is refused when it is not a ticket at all', async () => {
		for (const junk of ['', '.', 'nodot', 'a.b', '%%%.%%%']) {
			expect((await readTicket(junk, SECRET, 1_000_000)).ok).toBe(false);
		}
	});
});

describe('the pass this app issues', () => {
	it('reads back what was signed', async () => {
		const now = 2_000_000;
		const p = { id: 'discord:123', name: 'davis9001', exp: now + PASS_LIFE };
		expect(await readPass(await signPass(p, SECRET), SECRET, now)).toEqual(p);
	});

	it('is nothing once it has lapsed, and nothing if edited', async () => {
		const p = { id: 'discord:123', name: 'davis9001', exp: 2_000_100 };
		const signed = await signPass(p, SECRET);
		expect(await readPass(signed, SECRET, 2_000_101)).toBeNull();
		expect(await readPass(signed, 'another-key', 2_000_000)).toBeNull();
		expect(await readPass(`${signed}x`, SECRET, 2_000_000)).toBeNull();
	});

	/** The ticket key and the session key are different keys, on purpose. */
	it('cannot be minted with the ticket secret alone', async () => {
		const p = { id: 'discord:123', name: 'davis9001', exp: 2_000_100 };
		const signed = await signPass(p, 'the-ticket-key');
		expect(await readPass(signed, 'the-session-key', 2_000_000)).toBeNull();
	});
});
