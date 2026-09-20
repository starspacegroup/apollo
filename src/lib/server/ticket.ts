/**
 * The hub's handshake: a ticket minted by `dirac-gate`, spent here once.
 *
 * `~/_Workbench/dirac/plans/one-front-door.md` — David's front door is
 * `dirac.davis9001.dev`, and its rule is that **the hub never proxies a
 * service**. `/apollo` is a 302 into `/sso?aud=apollo`; the hub, which has
 * already signed the person in with Discord, mints a short ticket and sends
 * them here with it. This file is the far end.
 *
 * Why it is worth doing rather than finishing Apollo's own Discord login: the
 * board's OAuth has been one secret and one redirect URI short since
 * 2026-09-07, and both are steps only David can take in two web consoles.
 * A ported service **has no Discord OAuth of its own** — karaoke was built
 * that way on purpose and "needed no new redirect URI". Taking a ticket
 * removes the blocker instead of waiting on it.
 *
 * The construction is the hub's, copied rather than invented:
 * `base64url(json).hmac`, HMAC-SHA256 over the JSON with the shared secret at
 * `~/.config/dirac/sso/secret`, which is a **separate key** from this app's
 * `AUTH_SECRET` and from the hub's own session key — a service's session key
 * must stay unable to mint tickets, and the ticket key must stay unable to
 * forge a session.
 */

export interface Ticket {
	/** Which service it is for. Anything but `apollo` is refused here. */
	aud: string;
	/** The display name the hub knew them by. */
	who: string;
	/** Their Discord id. */
	sub: string;
	/** Seconds since the epoch. The hub gives a ticket 60 of them. */
	exp: number;
	/** Once. Replay is refused by remembering this until it expires. */
	jti: string;
}

function b64urlToBytes(s: string): Uint8Array {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
	const bin = atob(b64 + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function bytesToB64url(b: ArrayBuffer): string {
	const bytes = new Uint8Array(b);
	let bin = '';
	for (const byte of bytes) bin += String.fromCharCode(byte);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant time, because a comparison that returns early leaks the signature. */
function same(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export type Refusal =
	| 'no secret configured'
	| 'malformed'
	| 'bad signature'
	| 'not for this service'
	| 'expired';

/**
 * Read a ticket, or say why not.
 *
 * Every check is a refusal with a reason, and the reason is for the log rather
 * than for the visitor: a page that explains exactly which check failed is a
 * page that helps somebody tune a forgery.
 */
export async function readTicket(
	token: string,
	secret: string,
	now = Math.floor(Date.now() / 1000)
): Promise<{ ok: true; ticket: Ticket } | { ok: false; why: Refusal }> {
	if (!secret) return { ok: false, why: 'no secret configured' };
	const dot = token.lastIndexOf('.');
	if (dot <= 0) return { ok: false, why: 'malformed' };
	const body = token.slice(0, dot);
	const sig = token.slice(dot + 1);

	let payload: string;
	try {
		payload = new TextDecoder().decode(b64urlToBytes(body));
	} catch {
		return { ok: false, why: 'malformed' };
	}

	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	// The signature covers the JSON, not the base64 of it — that is what the
	// hub signs, and signing a different string here would fail every ticket.
	if (!same(bytesToB64url(mac), sig)) return { ok: false, why: 'bad signature' };

	let t: Ticket;
	try {
		t = JSON.parse(payload) as Ticket;
	} catch {
		return { ok: false, why: 'malformed' };
	}
	if (t.aud !== 'apollo') return { ok: false, why: 'not for this service' };
	if (!t.sub || !t.jti) return { ok: false, why: 'malformed' };
	// No clock skew allowance. Both ends are on the same machine's time or
	// Cloudflare's, and a minute is already the whole life of the thing.
	if (typeof t.exp !== 'number' || t.exp < now) return { ok: false, why: 'expired' };
	return { ok: true, ticket: t };
}

/** The session this app issues once a ticket has been spent. */
export interface Pass {
	id: string;
	name: string;
	exp: number;
}

export const PASS_COOKIE = 'apollo_pass';
/** A week. Long enough not to be a nuisance on a phone, short enough to lapse. */
export const PASS_LIFE = 7 * 24 * 60 * 60;

export async function signPass(p: Pass, secret: string): Promise<string> {
	const payload = JSON.stringify(p);
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	const b64 = bytesToB64url(new TextEncoder().encode(payload).buffer as ArrayBuffer);
	return `${b64}.${bytesToB64url(mac)}`;
}

export async function readPass(
	cookie: string,
	secret: string,
	now = Math.floor(Date.now() / 1000)
): Promise<Pass | null> {
	if (!secret) return null;
	const dot = cookie.lastIndexOf('.');
	if (dot <= 0) return null;
	let payload: string;
	try {
		payload = new TextDecoder().decode(b64urlToBytes(cookie.slice(0, dot)));
	} catch {
		return null;
	}
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	if (!same(bytesToB64url(mac), cookie.slice(dot + 1))) return null;
	try {
		const p = JSON.parse(payload) as Pass;
		if (typeof p.exp !== 'number' || p.exp < now || !p.id) return null;
		return p;
	} catch {
		return null;
	}
}
