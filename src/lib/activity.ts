/**
 * The Embedded App SDK, held once for the whole Activity.
 *
 * The door (`/activity`) opens it and finishes the handshake; the project
 * page reads where it was opened and who else is in the instance. It lives
 * here rather than in a page because a page is torn down on navigation and
 * the SDK's connection to the Discord client must not be.
 */
import type { DiscordSDK } from '@discord/embedded-app-sdk';

let sdk: DiscordSDK | null = null;

export function setSdk(s: DiscordSDK) {
	sdk = s;
}

export function getSdk(): DiscordSDK | null {
	return sdk;
}

/**
 * The signed pass `/api/activity/token` issued, held in memory. The cookie
 * alone is not enough: some Discord clients (2026-11-07) never send a
 * third-party cookie back from the iframe, partitioned or not, and the
 * board answered 401 straight after a good sign-in. Every API call from the
 * Activity goes through `api()`, which carries the pass as a bearer header.
 */
// Kept in sessionStorage as well, which lives inside the iframe where a
// third-party cookie does not, so a reload after a deploy is still signed in.
const PASS_KEY = 'apollo.activity.pass';
const LAUNCH_KEY = 'apollo.activity.launch';

function stored(key: string): string | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
	} catch {
		return null;
	}
}
function store(key: string, value: string | null) {
	try {
		if (value === null) sessionStorage.removeItem(key);
		else sessionStorage.setItem(key, value);
	} catch {
		/* storage blocked: memory only */
	}
}

let pass: string | null = stored(PASS_KEY);

export function setPass(p: string | null | undefined) {
	pass = p ?? null;
	store(PASS_KEY, pass);
}

/** The query Discord launched the Activity with (`frame_id`, `instance_id`, …), which the SDK needs again after a reload. */
export function rememberLaunch(search: string) {
	const q = new URLSearchParams(search);
	q.delete('to');
	if (q.has('frame_id') && q.get('frame_id') !== 'kept') store(LAUNCH_KEY, q.toString());
}

/**
 * Reload into a new build without losing the place: back through the door,
 * which re-runs the SDK handshake (silent after the first consent) and then
 * goes to `to` — the page that was open.
 */
export function reloadInPlace() {
	const q = new URLSearchParams(stored(LAUNCH_KEY) ?? location.search);
	q.delete('to');
	if (location.pathname !== '/activity') q.set('to', location.pathname + location.search);
	location.replace(`/activity?${q.toString()}`);
}

/**
 * `<img use:face={key}>`: a face is behind the owner gate (some are pictures
 * David chose), and an `<img src>` can carry neither the header nor, inside
 * Discord, the cookie. So the bytes come through `api()` and the image is
 * shown from a blob URL, cached for the page's life.
 */
const faces = new Map<string, Promise<string | null>>();
function faceUrl(key: string): Promise<string | null> {
	let u = faces.get(key);
	if (!u) {
		u = api(`/api/face/${encodeURIComponent(key)}`)
			.then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
			.catch(() => null);
		faces.set(key, u);
		void u.then((v) => {
			if (!v) faces.delete(key);
		});
	}
	return u;
}
export function face(img: HTMLImageElement, key: string) {
	let current = key;
	const load = (k: string) =>
		void faceUrl(k).then((u) => {
			if (u && current === k) img.src = u;
		});
	load(key);
	return {
		update(k: string) {
			current = k;
			load(k);
		}
	};
}

export function api(input: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	if (pass && !headers.has('authorization')) headers.set('authorization', `Bearer ${pass}`);
	return fetch(input, { ...init, headers, credentials: 'include' });
}

/** Somebody in the Activity instance, as Discord names them. */
export interface Participant {
	id: string;
	username: string;
	global_name?: string | null;
	avatar?: string | null;
}

export async function participants(): Promise<Participant[]> {
	if (!sdk) return [];
	try {
		const r = await sdk.commands.getInstanceConnectedParticipants();
		return (r.participants ?? []) as Participant[];
	} catch {
		return [];
	}
}

/** Who is talking in the voice channel, from Discord itself: a user id each time a mouth opens or closes. */
export function onSpeaking(
	channelId: string,
	cb: (userId: string, speaking: boolean) => void
): () => void {
	if (!sdk) return () => {};
	const start = (e: { user_id: string }) => cb(e.user_id, true);
	const stop = (e: { user_id: string }) => cb(e.user_id, false);
	const s = sdk;
	void s.subscribe('SPEAKING_START', start, { channel_id: channelId }).catch(() => {});
	void s.subscribe('SPEAKING_STOP', stop, { channel_id: channelId }).catch(() => {});
	return () => {
		void s.unsubscribe('SPEAKING_START', start, { channel_id: channelId }).catch(() => {});
		void s.unsubscribe('SPEAKING_STOP', stop, { channel_id: channelId }).catch(() => {});
	};
}

export function channelId(): string | null {
	return sdk?.channelId ?? null;
}

/** A link out of the sandbox. Inside Discord a plain `<a target=_blank>` goes nowhere. */
export async function openLink(url: string) {
	if (sdk) {
		try {
			await sdk.commands.openExternalLink({ url });
			return;
		} catch {
			/* fall through to the browser */
		}
	}
	window.open(url, '_blank', 'noopener');
}

/** The avatar URL for a Discord participant: a CDN image, or none. */
export function avatarOf(p: Participant): string | null {
	if (!p.avatar) return null;
	return `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64`;
}
