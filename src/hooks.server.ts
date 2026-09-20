import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { handle as authHandle } from './auth';
import { PASS_COOKIE, readPass } from '$lib/server/ticket';

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

export const handle = sequence(authHandle, pass);
