import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { ensureMember, parseOwners } from '$lib/server/access';
import { PASS_COOKIE, PASS_LIFE, signPass } from '$lib/server/ticket';
import type { RequestHandler } from './$types';

/**
 * `POST /api/activity/token` `{ code }` — the Activity's sign-in.
 *
 * The Embedded App SDK hands the page an authorization code; this spends it
 * with the application's secret, which only the Worker holds, and then asks
 * Discord who the token belongs to. The identity is Discord's answer, never
 * the page's claim, so the member row and the pass carry an id the owner
 * gate can trust. The token itself goes back to the page for one purpose:
 * `authenticate`, which finishes the SDK's handshake.
 *
 * The pass is the cookie `/auth/sso` issues, with two attributes the hub's
 * door never needs: `SameSite=None`, because the page is an iframe on
 * `<app id>.discordsays.com`, and `Partitioned`, so the cookie exists only
 * inside Discord's frames and never leaks to the same host opened anywhere
 * else.
 */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	const clientId = env.DISCORD_CLIENT_ID ?? '';
	const clientSecret = env.DISCORD_CLIENT_SECRET ?? '';
	if (!clientId || !clientSecret) {
		return json({ error: 'the Worker has no Discord application configured' }, { status: 503 });
	}
	let code = '';
	try {
		code = String(((await request.json()) as { code?: unknown }).code ?? '');
	} catch {
		code = '';
	}
	if (!code) return json({ error: 'no code' }, { status: 400 });

	const exchange = await fetch('https://discord.com/api/oauth2/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'authorization_code',
			code
		})
	});
	if (!exchange.ok) {
		console.warn(`[activity] discord refused the code: ${exchange.status}`);
		return json({ error: 'discord refused the code' }, { status: 401 });
	}
	const { access_token } = (await exchange.json()) as { access_token?: string };
	if (!access_token) return json({ error: 'no token' }, { status: 502 });

	const me = await fetch('https://discord.com/api/users/@me', {
		headers: { authorization: `Bearer ${access_token}` }
	});
	if (!me.ok) {
		console.warn(`[activity] discord would not say who the token is: ${me.status}`);
		return json({ error: 'discord would not say who you are' }, { status: 502 });
	}
	const who = (await me.json()) as {
		id: string;
		username?: string;
		global_name?: string | null;
		avatar?: string | null;
	};
	const id = `discord:${who.id}`;
	const name = who.global_name || who.username || who.id;
	const avatar = who.avatar
		? `https://cdn.discordapp.com/avatars/${who.id}/${who.avatar}.png`
		: null;

	const db = (platform?.env as Record<string, unknown> | undefined)?.DB as D1Database | undefined;
	if (db) await ensureMember(db, id, name, avatar, parseOwners(env.APOLLO_OWNER));

	const exp = Math.floor(Date.now() / 1000) + PASS_LIFE;
	const pass = await signPass({ id, name, exp }, env.AUTH_SECRET ?? '');
	cookies.set(PASS_COOKIE, pass, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'none',
		partitioned: true,
		maxAge: PASS_LIFE
	});
	return json({ access_token, id, name });
};
