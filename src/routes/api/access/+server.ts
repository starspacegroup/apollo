import { json } from '@sveltejs/kit';
import {
	ensureMember,
	LEVELS,
	listGrants,
	listMembers,
	parseOwners,
	ROLES,
	sessionMemberId,
	setGrant,
	setRole,
	type Level,
	type Role
} from '$lib/server/access';
import type { RequestHandler } from './$types';

/**
 * Who may see what: read by the owner and admins, written by the owner (a
 * grant) and the owner alone (a role). Every write is somebody's, by id, and
 * a person cannot change their own role: the owner stays the owner by being
 * named on the Worker, not by a form.
 */
async function asking(
	platform: App.Platform | undefined,
	locals: App.Locals
): Promise<{ db: D1Database; me: { id: string; role: Role } } | Response> {
	let user: App.Session['user'] | undefined;
	try {
		user = (await locals.auth?.())?.user;
	} catch {
		user = undefined;
	}
	const id = sessionMemberId(user);
	if (!id) return json({ error: 'sign in first' }, { status: 401 });
	const env = (platform?.env ?? {}) as { DB?: D1Database; APOLLO_OWNER?: string };
	if (!env.DB) return json({ error: 'no database is bound to this Worker' }, { status: 503 });
	const me = await ensureMember(
		env.DB,
		id,
		user?.username ?? user?.name ?? id,
		user?.image ?? null,
		parseOwners(env.APOLLO_OWNER)
	);
	if (me.role === 'guest')
		return json({ error: "the access page is the owner's" }, { status: 403 });
	return { db: env.DB, me: { id, role: me.role } };
}

/** Every member, every grant, and the projects the latest snapshot names. */
export const GET: RequestHandler = async ({ platform, locals }) => {
	const a = await asking(platform, locals);
	if (a instanceof Response) return a;
	const kv = (platform?.env as Record<string, unknown> | undefined)?.APOLLO_SNAPSHOT;
	let projects: string[] = [];
	if (kv && typeof (kv as { get?: unknown }).get === 'function') {
		const text = await (kv as { get: (k: string, t: string) => Promise<string | null> }).get(
			'board',
			'text'
		);
		if (text) {
			try {
				const b = JSON.parse(text) as { projects?: { name: string }[] };
				projects = (b.projects ?? []).map((p) => p.name).sort((x, y) => x.localeCompare(y));
			} catch {
				projects = [];
			}
		}
	}
	return json({
		me: a.me,
		members: await listMembers(a.db),
		grants: await listGrants(a.db),
		projects,
		levels: LEVELS,
		roles: ROLES
	});
};

/** `{member, project, level}` sets a grant; `{member, role}` sets a role (owner only). */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const a = await asking(platform, locals);
	if (a instanceof Response) return a;
	const body = (await request.json().catch(() => null)) as {
		member?: string;
		project?: string;
		level?: string;
		role?: string;
	} | null;
	const member = body?.member?.trim() ?? '';
	if (!member || member.length > 200) return json({ error: 'which member?' }, { status: 400 });
	if (body?.role !== undefined) {
		if (a.me.role !== 'owner')
			return json({ error: 'only the owner changes roles' }, { status: 403 });
		if (member === a.me.id) return json({ error: 'not your own role' }, { status: 400 });
		if (!ROLES.includes(body.role as Role))
			return json({ error: `role: ${ROLES.join(', ')}` }, { status: 400 });
		await setRole(a.db, member, body.role as Role);
		return json({ ok: true });
	}
	const project = body?.project?.trim() ?? '';
	const level = body?.level ?? '';
	if (!project || project.length > 200) return json({ error: 'which project?' }, { status: 400 });
	if (!LEVELS.includes(level as Level))
		return json({ error: `level: ${LEVELS.join(', ')}` }, { status: 400 });
	if (a.me.role !== 'owner')
		return json({ error: 'only the owner grants access' }, { status: 403 });
	await setGrant(a.db, member, project, level as Level, a.me.id);
	return json({ ok: true });
};
