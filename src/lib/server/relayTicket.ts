/**
 * The ticket a viewer carries to the voice relay. A WebSocket cannot send the
 * pass cookie's claims as headers from a page, so the Worker signs a short
 * ticket with the same secret and the relay reads it back. No SvelteKit
 * imports here: the Durable Object is bundled outside the app.
 */
export interface RelayTicket {
	project: string;
	/** `discord:1234`, as the member is known. */
	id: string;
	name: string;
	/** `david` for the owner's own account, `outside` for everyone else. */
	provenance: 'david' | 'outside';
	exp: number;
}

/** Two minutes: long enough to open the socket, too short to be worth stealing. */
export const RELAY_TICKET_LIFE = 120;

function b64url(bytes: ArrayBuffer | Uint8Array): string {
	const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of u) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
	const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
	const out = new Uint8Array(b.length);
	for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
	return out;
}
async function mac(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function signRelayTicket(t: RelayTicket, secret: string): Promise<string> {
	const payload = JSON.stringify(t);
	return `${b64url(new TextEncoder().encode(payload))}.${await mac(payload, secret)}`;
}

export async function readRelayTicket(
	ticket: string,
	secret: string,
	now = Math.floor(Date.now() / 1000)
): Promise<RelayTicket | null> {
	if (!secret) return null;
	const dot = ticket.lastIndexOf('.');
	if (dot <= 0) return null;
	let payload: string;
	try {
		payload = new TextDecoder().decode(unb64url(ticket.slice(0, dot)));
	} catch {
		return null;
	}
	const want = await mac(payload, secret);
	const got = ticket.slice(dot + 1);
	if (want.length !== got.length) return null;
	let diff = 0;
	for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
	if (diff) return null;
	try {
		const t = JSON.parse(payload) as RelayTicket;
		if (!t.project || !t.id || typeof t.exp !== 'number' || t.exp < now) return null;
		if (t.provenance !== 'david' && t.provenance !== 'outside') return null;
		return t;
	} catch {
		return null;
	}
}
