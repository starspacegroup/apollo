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
let pass: string | null = null;

export function setPass(p: string | null | undefined) {
	pass = p ?? null;
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
