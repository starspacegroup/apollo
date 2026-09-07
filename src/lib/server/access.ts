/**
 * Who may see what, and how much they may do about it.
 *
 * David, 2026-09-07: *"I'm going to want to log in to it with discord and let
 * others log in with discord and I should be able to manage who can see which
 * projects and how much control they have over them."*
 *
 * Three roles for a person: the **owner** (David) sees and may do everything
 * and manages access; an **admin** sees and may do everything on every
 * project; a **guest** has exactly the grants they were given. Three levels a
 * guest can hold on a project: **view** sees it on the board; **member** may
 * also ask for work on it (a request through the ladder, never a command);
 * **manager** may also lower things on it — pause it, switch a capability
 * off, cap its autonomy, name its team, mark its attention seen. Fleet-wide
 * lowering (the whole fleet paused, capped or switched off) is the owner's
 * and an admin's alone. Nothing here can raise anything: the wire only lowers
 * (plans/dirac-bridge.md §4), whoever is on it.
 *
 * The pure half is here and tested; the D1 half is thin.
 */
import type { Board } from '$lib/board';

export type Role = 'owner' | 'admin' | 'guest';
export type Level = 'none' | 'view' | 'member' | 'manager';

export const LEVELS: Level[] = ['none', 'view', 'member', 'manager'];
export const ROLES: Role[] = ['owner', 'admin', 'guest'];

export interface Member {
	id: string;
	name: string;
	avatar: string | null;
	role: Role;
	first_seen: number;
	last_seen: number;
}

export interface Grant {
	member: string;
	project: string;
	level: Level;
	granted_by: string;
	granted_at: number;
}

/** What the board tells the page about the person reading it. */
export interface Viewer {
	id: string;
	name: string;
	avatar: string | null;
	role: Role;
	/** Every project this person may see, with the level they hold on it. */
	projects: Record<string, Level>;
	/** A grant on `'*'`, when one is held. */
	everywhere: Level;
}

/** `discord:1234` — the id a member is known by, whatever they signed in with. */
export function memberId(provider: string, id: string): string {
	return `${provider}:${id}`;
}

/** The owner ids the Worker is configured with: `APOLLO_OWNER=discord:123,discord:456`. */
export function parseOwners(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

function rank(l: Level): number {
	return LEVELS.indexOf(l);
}

/** The level a person holds on a project, from their role and their grants. */
export function levelFor(role: Role, grants: Grant[], project: string): Level {
	if (role === 'owner' || role === 'admin') return 'manager';
	let best: Level = 'none';
	for (const g of grants) {
		if ((g.project === project || g.project === '*') && rank(g.level) > rank(best)) {
			best = g.level;
		}
	}
	return best;
}

/** Whether a level is at least another. */
export function atLeast(have: Level, want: Level): boolean {
	return rank(have) >= rank(want);
}

/**
 * The project an intent is about, or null for a fleet-wide one. Mirrors what
 * the daemon reads (apollod `link.rs`): `project` in the payload.
 */
export function projectOf(payload: Record<string, unknown>): string | null {
	const p = payload.project;
	return typeof p === 'string' && p.trim() ? p.trim() : null;
}

/**
 * Why this person may not ask for this, or null when they may. The rule per
 * kind: asking for work needs `member`; lowering something on a project needs
 * `manager`; lowering the whole fleet needs the owner or an admin.
 */
export function mayAsk(
	kind: string,
	payload: Record<string, unknown>,
	role: Role,
	grants: Grant[]
): string | null {
	if (role === 'owner' || role === 'admin') return null;
	const project = projectOf(payload);
	const level = project ? levelFor(role, grants, project) : 'none';
	switch (kind) {
		case 'work.request':
			if (!project) return 'a work request names a project';
			if (!atLeast(level, 'member')) return `you are not a member of ${project}`;
			return null;
		case 'project.pause':
		case 'team.set':
			if (!project) return `${kind} names a project`;
			if (!atLeast(level, 'manager')) return `you do not manage ${project}`;
			return null;
		case 'switch.off':
		case 'autonomy.lower':
			if (!project) return `${kind} for the whole fleet is the owner's`;
			if (!atLeast(level, 'manager')) return `you do not manage ${project}`;
			return null;
		case 'attention.resolve':
			// The item's project is not in the payload; the machine checks the
			// id. A guest with nothing to manage has nothing to resolve.
			if (!grants.some((g) => atLeast(g.level, 'manager'))) return 'you manage no project';
			return null;
		case 'pause':
			return "pausing the whole fleet is the owner's";
		default:
			return `\`${kind}\` is not something you may ask for`;
	}
}

/** The projects a person may see, from what the board holds. */
export function visibleProjects(board: Board, role: Role, grants: Grant[]): Record<string, Level> {
	const out: Record<string, Level> = {};
	for (const p of board.projects) {
		const l = levelFor(role, grants, p.name);
		if (l !== 'none') out[p.name] = l;
	}
	return out;
}

/**
 * The board as this person may see it: their projects and nothing about the
 * others — not the switches on them, not the attention they raised, not the
 * decisions about them, not their pull requests. The fleet's own facts (the
 * dial, the gate, the meters) stay: they are about the machine, not a project.
 * The owner and an admin see the board whole.
 */
export function visibleBoard(board: Board, viewer: Viewer): Board {
	if (viewer.role === 'owner' || viewer.role === 'admin') return { ...board, viewer };
	const allowed = new Set(Object.keys(viewer.projects));
	const remotes = new Set(
		board.projects
			.filter((p) => allowed.has(p.name))
			.map((p) => p.remote)
			.filter((r): r is string => !!r)
			.map((r) => r.toLowerCase())
	);
	const caveats = [...board.caveats];
	if (allowed.size === 0) {
		caveats.push(
			'You have no access to any project yet. The owner grants it, per project, on the access page.'
		);
	}
	return {
		...board,
		projects: board.projects.filter((p) => allowed.has(p.name)),
		actors: board.actors.filter((a) => {
			const home = (a as { home?: string }).home ?? '';
			return board.projects.some(
				(p) => allowed.has(p.name) && home && (home === p.path || home.startsWith(p.path + '/'))
			);
		}),
		pull_requests: board.pull_requests
			? {
					...board.pull_requests,
					cards: board.pull_requests.cards.filter((c) => remotes.has(c.repo.toLowerCase()))
				}
			: null,
		attention: board.attention.filter((a) =>
			allowed.has((a as { subject?: string }).subject ?? '')
		),
		decisions: board.decisions.filter((d) =>
			allowed.has((d as { project?: string }).project ?? '')
		),
		switches: board.switches
			? {
					...board.switches,
					projects: board.switches.projects.filter((p) => allowed.has(p.name))
				}
			: undefined,
		caveats,
		viewer
	};
}

// ── The D1 half ─────────────────────────────────────────────────────────────

interface SessionUser {
	id?: string;
	name?: string | null;
	image?: string | null;
	username?: string;
	provider?: string;
}

/** The member id of a signed-in session, or null. */
export function sessionMemberId(user: SessionUser | undefined | null): string | null {
	if (!user?.id) return null;
	return memberId(user.provider ?? 'github', user.id);
}

/**
 * Note a sign-in: the member row, made or touched. The role is decided here:
 * an id the Worker names as owner is the owner; the first person in when no
 * owner is named becomes the owner (so a fresh deploy has one); anyone else
 * keeps the role they have, guest to begin with.
 */
export async function ensureMember(
	db: D1Database,
	id: string,
	name: string,
	avatar: string | null,
	owners: string[]
): Promise<Member> {
	const now = Math.floor(Date.now() / 1000);
	const existing = await db
		.prepare('SELECT id, name, avatar, role, first_seen, last_seen FROM members WHERE id = ?')
		.bind(id)
		.first<Member>();
	let role: Role = existing?.role ?? 'guest';
	if (owners.includes(id)) role = 'owner';
	else if (!existing && owners.length === 0) {
		const any = await db.prepare('SELECT count(*) AS n FROM members').first<{ n: number }>();
		if (!any || Number(any.n) === 0) role = 'owner';
	}
	await db
		.prepare(
			`INSERT INTO members (id, name, avatar, role, first_seen, last_seen)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar,
			   role = excluded.role, last_seen = excluded.last_seen`
		)
		.bind(id, name, avatar, role, existing?.first_seen ?? now, now)
		.run();
	return { id, name, avatar, role, first_seen: existing?.first_seen ?? now, last_seen: now };
}

export async function grantsOf(db: D1Database, member: string): Promise<Grant[]> {
	const r = await db
		.prepare(
			'SELECT member, project, level, granted_by, granted_at FROM grants WHERE member = ? ORDER BY project'
		)
		.bind(member)
		.all<Grant>();
	return r.results ?? [];
}

export async function listMembers(db: D1Database): Promise<Member[]> {
	const r = await db
		.prepare(
			'SELECT id, name, avatar, role, first_seen, last_seen FROM members ORDER BY last_seen DESC'
		)
		.all<Member>();
	return r.results ?? [];
}

export async function listGrants(db: D1Database): Promise<Grant[]> {
	const r = await db
		.prepare(
			'SELECT member, project, level, granted_by, granted_at FROM grants ORDER BY member, project'
		)
		.all<Grant>();
	return r.results ?? [];
}

/** Set a member's level on a project (`'*'` for every project); `none` removes it. */
export async function setGrant(
	db: D1Database,
	member: string,
	project: string,
	level: Level,
	by: string
): Promise<void> {
	if (level === 'none') {
		await db
			.prepare('DELETE FROM grants WHERE member = ? AND project = ?')
			.bind(member, project)
			.run();
		return;
	}
	await db
		.prepare(
			`INSERT INTO grants (member, project, level, granted_by, granted_at)
			 VALUES (?, ?, ?, ?, unixepoch())
			 ON CONFLICT(member, project) DO UPDATE SET level = excluded.level,
			   granted_by = excluded.granted_by, granted_at = excluded.granted_at`
		)
		.bind(member, project, level, by)
		.run();
}

export async function setRole(db: D1Database, member: string, role: Role): Promise<void> {
	await db.prepare('UPDATE members SET role = ? WHERE id = ?').bind(role, member).run();
}

/** The viewer a board is filtered for: the member, their grants, their projects. */
export function viewerOf(member: Member, grants: Grant[], board: Board): Viewer {
	return {
		id: member.id,
		name: member.name,
		avatar: member.avatar,
		role: member.role,
		projects: visibleProjects(board, member.role, grants),
		everywhere: levelFor(
			'guest',
			grants.filter((g) => g.project === '*'),
			'*'
		)
	};
}
