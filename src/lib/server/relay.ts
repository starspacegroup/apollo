/**
 * The voice relay: one Durable Object, `hub`, holding every Activity viewer's
 * socket and the one socket from home (`apollo-voice`). A viewer's utterance
 * goes home as it is; what home says comes back to the viewers of that
 * project. Nothing is stored and nothing is decided here — the relay is a
 * wire, and the ladder, the dial and the gate are all at home.
 *
 * Hibernatable WebSockets, so a phone left open on the page costs nothing
 * between words. Tags: `viewer`, `p:<project>`; or `home`.
 */
import { DurableObject } from 'cloudflare:workers';
import { readRelayTicket, type RelayTicket } from './relayTicket';

interface Env {
	AUTH_SECRET?: string;
	APOLLO_LINK_TOKEN?: string;
}

type Viewer = Pick<RelayTicket, 'project' | 'id' | 'name' | 'provenance'>;

/** Over this a message is dropped, not relayed: a minute of opus, or a long line's audio. */
const MAX_MESSAGE = 900_000;

export class VoiceRelay extends DurableObject<Env> {
	async fetch(req: Request): Promise<Response> {
		if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
			return new Response('the relay speaks WebSocket', { status: 426 });
		}
		const url = new URL(req.url);
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		const auth = req.headers.get('authorization') ?? '';
		if (auth.startsWith('Bearer ') && req.headers.get('x-apollo-home') === '1') {
			const token = this.env.APOLLO_LINK_TOKEN ?? '';
			if (!token || auth.slice(7) !== token) return new Response('not home', { status: 403 });
			// One home at a time: a reconnect replaces the socket it lost.
			for (const old of this.ctx.getWebSockets('home')) {
				try {
					old.close(4000, 'replaced');
				} catch {
					/* gone */
				}
			}
			this.ctx.acceptWebSocket(server, ['home']);
			server.serializeAttachment({ home: true });
			// What is waiting: viewers per project, so home starts reading those rooms.
			for (const [project, n] of this.counts()) {
				server.send(JSON.stringify({ t: 'viewers', project, n }));
			}
			this.broadcastAll({ t: 'home', on: true });
			return new Response(null, { status: 101, webSocket: client });
		}

		const ticket = await readRelayTicket(
			url.searchParams.get('ticket') ?? '',
			this.env.AUTH_SECRET ?? ''
		);
		if (!ticket) return new Response('no ticket', { status: 401 });
		const v: Viewer = {
			project: ticket.project,
			id: ticket.id,
			name: ticket.name,
			provenance: ticket.provenance
		};
		this.ctx.acceptWebSocket(server, ['viewer', `p:${v.project}`]);
		server.serializeAttachment(v);
		server.send(JSON.stringify({ t: 'home', on: this.home() !== null }));
		this.tellHome({
			t: 'viewers',
			project: v.project,
			n: this.ctx.getWebSockets(`p:${v.project}`).length
		});
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return;
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		const att = ws.deserializeAttachment() as (Viewer & { home?: undefined }) | { home: true };
		if ('home' in att && att.home) {
			// Home's heartbeat: a socket a deploy left half-open looks alive
			// from home's side and never closes, and the switches stay grey.
			if (msg.t === 'ping') {
				ws.send(JSON.stringify({ t: 'pong' }));
				return;
			}
			// home → the viewers of one project
			if (msg.t === 'to' && typeof msg.project === 'string' && msg.msg) {
				const out = JSON.stringify(msg.msg);
				for (const w of this.ctx.getWebSockets(`p:${msg.project}`)) {
					try {
						w.send(out);
					} catch {
						/* closing */
					}
				}
			}
			return;
		}
		// viewer → home, stamped with who they are; a viewer cannot say who it is.
		if (msg.t === 'ping') {
			ws.send(JSON.stringify({ t: 'pong', home: this.home() !== null }));
			return;
		}
		if (
			msg.t === 'utter' ||
			msg.t === 'say' ||
			msg.t === 'seat' ||
			msg.t === 'channel' ||
			msg.t === 'member'
		) {
			const seat = () => ({
				handle: String(msg.handle ?? '').slice(0, 64),
				name: String(msg.name ?? '').slice(0, 64),
				on: msg.on === true
			});
			const body =
				msg.t === 'utter'
					? { audio: msg.audio, mime: msg.mime }
					: msg.t === 'say'
						? { text: msg.text }
						: msg.t === 'channel'
							? // The channel the call is in; home checks it is this project's.
								{
									room: String(msg.room ?? '').slice(0, 160),
									seats: (Array.isArray(msg.seats) ? msg.seats : [])
										.slice(0, 40)
										.map((x: unknown) => {
											const o = (x ?? {}) as Record<string, unknown>;
											return {
												handle: String(o.handle ?? '').slice(0, 64),
												name: String(o.name ?? '').slice(0, 64)
											};
										})
								}
							: msg.t === 'member'
								? // An agent into or out of a channel; home lets only the owner.
									{ room: String(msg.room ?? '').slice(0, 160), ...seat() }
								: // An agent into or out of the call (`apollo-voice` keeps the seats).
									seat();
			const stamped = {
				t: msg.t,
				project: att.project,
				who: att.provenance === 'david' ? 'david' : att.name,
				id: att.id,
				provenance: att.provenance,
				...body
			};
			if (!this.tellHome(stamped)) ws.send(JSON.stringify({ t: 'home', on: false }));
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		this.gone(ws);
	}
	async webSocketError(ws: WebSocket): Promise<void> {
		this.gone(ws);
	}

	private gone(ws: WebSocket) {
		const att = ws.deserializeAttachment() as { home?: boolean; project?: string } | null;
		if (att?.home) {
			if (this.home() === null) this.broadcastAll({ t: 'home', on: false });
			return;
		}
		if (att?.project) {
			const n = this.ctx.getWebSockets(`p:${att.project}`).filter((w) => w !== ws).length;
			this.tellHome({ t: 'viewers', project: att.project, n });
		}
	}

	private home(): WebSocket | null {
		const open = this.ctx.getWebSockets('home').filter((w) => w.readyState === 1);
		return open[0] ?? null;
	}
	private tellHome(msg: unknown): boolean {
		const h = this.home();
		if (!h) return false;
		try {
			h.send(JSON.stringify(msg));
			return true;
		} catch {
			return false;
		}
	}
	private broadcastAll(msg: unknown) {
		const out = JSON.stringify(msg);
		for (const w of this.ctx.getWebSockets('viewer')) {
			try {
				w.send(out);
			} catch {
				/* closing */
			}
		}
	}
	private counts(): Map<string, number> {
		const m = new Map<string, number>();
		for (const w of this.ctx.getWebSockets('viewer')) {
			const a = w.deserializeAttachment() as Viewer;
			m.set(a.project, (m.get(a.project) ?? 0) + 1);
		}
		return m;
	}
}
