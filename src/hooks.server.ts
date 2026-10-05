import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { handle as authHandle } from './auth';
import { PASS_COOKIE, readPass } from '$lib/server/ticket';
import { gate, parseOwners, sessionMemberId } from '$lib/server/access';
import { dev } from '$app/environment';

/**
 * Two doors, one `locals.auth()`.
 *
 * Auth.js is the first: Discord or GitHub, straight at this app. The second is
 * the hub's pass (`/auth/sso`), for somebody who came through
 * `dirac.davis9001.dev/apollo` and was signed in there. Everything downstream
 * — the layout, `/api/board`, `access.ts` — asks `locals.auth()` and does not
 * care which door was used, which is the point: one identity shape, two ways
 * of arriving.
 *
 * The pass is only consulted when Auth.js has nothing. A real Auth.js session
 * always wins, so signing in here directly is never overridden by a stale
 * cookie from the hub.
 */
const pass: Handle = async ({ event, resolve }) => {
	const original = event.locals.auth;
	event.locals.auth = async () => {
		const session = await original?.();
		if (session?.user) return session;
		const raw = event.cookies.get(PASS_COOKIE);
		if (!raw) return session ?? null;
		const p = await readPass(raw, env.AUTH_SECRET ?? '');
		if (!p) return session ?? null;
		// `access.ts` builds the member id as `provider:id`, so the provider
		// and the bare id are handed back separately rather than the joined
		// form — giving it `discord:discord:123` is the obvious way to get
		// this wrong.
		const [provider, ...rest] = p.id.split(':');
		return {
			user: { id: rest.join(':'), username: p.name, name: p.name, provider },
			expires: new Date(p.exp * 1000).toISOString()
		} as App.Session;
	};
	return resolve(event);
};

/**
 * The owner's, and nobody else's (David, 2026-10-05: "make sure that it's
 * only accessible by me on discord login").
 *
 * Every page and every API answers only a session whose id is named in
 * `APOLLO_OWNER`. Somebody signed out is sent to the hub's Discord login,
 * which hands back a one-time ticket at `/auth/sso`; somebody signed in who
 * is not the owner is refused outright. No owner named means nobody: a
 * Worker that cannot say who its owner is fails closed.
 *
 * Left open: the ticket's landing, the build's static files, and
 * `/api/link/*`, which the daemon reaches with its own bearer token and
 * which checks it itself.
 */
const LOGIN = 'https://dirac.davis9001.dev/sso?aud=apollo';

const ownerOnly: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (dev) return resolve(event);
	let user: App.Session['user'] | undefined;
	try {
		user = (await event.locals.auth?.())?.user;
	} catch {
		user = undefined;
	}
	const verdict = gate(path, sessionMemberId(user), parseOwners(env.APOLLO_OWNER));
	if (verdict === 'open' || verdict === 'pass') return resolve(event);
	if (verdict === 'unauthorized') {
		return new Response(JSON.stringify({ error: 'sign in first' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}
	if (verdict === 'login') {
		return new Response(null, { status: 303, headers: { location: env.APOLLO_LOGIN || LOGIN } });
	}
	{
		return new Response(
			'<!doctype html><meta charset="utf-8"><title>Apollo</title><body style="background:#05070d;color:#dbe6f5;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>This is a private board. You are signed in, but it is not yours.</p>',
			{ status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } }
		);
	}
	return resolve(event);
};

export const handle = sequence(authHandle, pass, ownerOnly);
