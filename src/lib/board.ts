/**
 * The board, as the local half serialises it.
 *
 * plans/surfaces.md §2 — "two APIs, one model": these types mirror
 * `apollod/crates/apollo-cli/src/export.rs` exactly. They are hand-written for
 * now; §5 of that plan says the Rust side should generate them, and it should,
 * because two hand-written definitions drift. Until then `schema` is the guard:
 * the page checks it and says so rather than rendering a shape it half knows.
 */
export const SCHEMA = 1;

export interface Meters {
	five_hour: number;
	five_hour_resets_at: string | null;
	weekly_all: number;
	weekly_resets_at: string | null;
	weekly_scoped: number;
	credits_used: number;
	credits_limit: number;
	sampled_at: string;
	sample_age_minutes: number;
}

export type Lane = 'needs_you' | 'unpushed' | 'quiet';

export interface Project {
	name: string;
	path: string;
	remote: string | null;
	branch: string | null;
	ahead: number;
	behind: number;
	dirty: number;
	dirty_for_minutes: number | null;
	last_commit_at: string | null;
	last_commit_summary: string | null;
	sessions: number;
	error: string | null;
	lane: Lane;
}

export interface Actor {
	name: string;
	pid: number;
	home: string;
	model: string | null;
	doing: string | null;
	character: string | null;
	last_activity: string | null;
	idle_minutes: number | null;
	started_at: string | null;
	state: 'working' | 'idle' | 'stale';
}

export interface Character {
	handle: string;
	display: string;
	purpose: string;
	model: string;
	wakes: string;
	trust: string;
	quota_class: string;
	register: number;
	committed: boolean;
	sha: string | null;
}

export interface Reconciled {
	local: number;
	remote: number;
	matched: number;
	ghosts: number;
	orphans: number;
	ambiguous: number;
}

export interface Board {
	schema: number;
	generated_at: string;
	machine: string;
	index_age_seconds: number;
	meters: Meters | null;
	projects: Project[];
	actors: Actor[];
	characters: Character[];
	reconciled: Reconciled;
	caveats: string[];
}

/** An honest nothing, for when no snapshot has reached the Worker. */
export function emptyBoard(reason: string): Board {
	return {
		schema: SCHEMA,
		generated_at: new Date().toISOString(),
		machine: 'unknown',
		index_age_seconds: -1,
		meters: null,
		projects: [],
		actors: [],
		characters: [],
		reconciled: { local: 0, remote: 0, matched: 0, ghosts: 0, orphans: 0, ambiguous: 0 },
		caveats: [reason]
	};
}

export function shortModel(id: string | null): string {
	if (!id) return '—';
	const s = id.toLowerCase();
	for (const m of ['fable', 'opus', 'sonnet', 'haiku']) if (s.includes(m)) return m;
	return id;
}

/** "3m", "2h", "6d" — the same vocabulary the CLI prints. */
export function ago(iso: string | null): string {
	if (!iso) return '—';
	const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
	if (s < 60) return `${Math.round(s)}s`;
	if (s < 3600) return `${Math.round(s / 60)}m`;
	if (s < 86400) return `${Math.round(s / 3600)}h`;
	return `${Math.round(s / 86400)}d`;
}

export function projectSummary(p: Project): string {
	if (p.error) return p.error;
	const bits: string[] = [];
	if (p.dirty > 0) {
		const days = p.dirty_for_minutes ? Math.floor(p.dirty_for_minutes / 1440) : 0;
		bits.push(days >= 1 ? `${p.dirty} uncommitted · dirty ${days}d` : `${p.dirty} uncommitted`);
	}
	if (p.ahead > 0) bits.push(`↑${p.ahead} unpushed`);
	if (p.behind > 0) bits.push(`↓${p.behind} behind`);
	if (bits.length === 0) return p.branch ?? 'clean';
	return bits.join(' · ');
}
