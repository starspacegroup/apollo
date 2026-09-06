/**
 * The board, as the local half serialises it.
 *
 * plans/surfaces.md §2 — "two APIs, one model": these types mirror
 * `apollod/crates/apollo-cli/src/export.rs` exactly. They are hand-written for
 * now; §5 of that plan says the Rust side should generate them, and it should,
 * because two hand-written definitions drift. Until then `schema` is the guard:
 * the page checks it and says so rather than rendering a shape it half knows.
 */
export const SCHEMA = 4;

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

/**
 * Which pile a pull request is in, chosen by what has to happen NEXT for it to
 * land. The local half takes this from dirac's pr-watch and does not re-sort
 * it: two surfaces that order the same list differently disagree about what
 * matters most, in public.
 */
export type PrBucket =
	| 'ready'
	| 'waiting_on_you'
	| 'checks_red'
	| 'conflicts'
	| 'changes_requested'
	| 'draft'
	| 'stale';

export interface PrCard {
	key: string;
	repo: string;
	number: number;
	title: string;
	url: string;
	author: string;
	bucket: PrBucket;
	/** Ordering, not a unit. Do not render it. */
	score: number;
	merge_state: string;
	review: string;
	adds: number;
	dels: number;
	age_days: number;
	idle_days: number;
}

/**
 * What a run that read the diff concluded — `good`, `needs-work` or `bad` —
 * kept apart from the mechanical bucket, because "ready" from the checks and
 * "good" from a reader answer different questions. Keyed by the card's `key`.
 * Absent on a snapshot from a local half that predates 2026-09-05.
 */
export interface PrVerdict {
	key: string;
	word: 'good' | 'needs-work' | 'bad';
	summary: string;
	by: string;
	at: string;
	posted: boolean;
}

/** A person's standing order: merge this one, this way, the tick it is green. */
export interface PrOrder {
	key: string;
	how: string;
	by: string;
	at: string | null;
}

/**
 * Every open pull request across David's account and organisations, as of the
 * last pr-watch pass. It carries its own age because it is a snapshot at most
 * six hours old, and a snapshot that does not say so reads like a live number.
 */
export interface Prs {
	generated_at: string;
	age_minutes: number;
	stale: boolean;
	/** `open`, plus one entry per bucket. */
	counts: Record<string, number>;
	/** Scopes that could not be searched on that pass; their PRs are missing. */
	unsearchable_scopes: string[];
	cards: PrCard[];
	/** The fleet's verdicts, where a run has read a diff. Optional: older snapshots lack it. */
	verdicts?: PrVerdict[];
	/** Standing merge orders a person set. Optional, as above. */
	orders?: PrOrder[];
}

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
	/**
	 * The project's own mark, inline as a `data:` URI — found on the machine
	 * where the StreamDeck finds it, so a tile there and a card here wear the
	 * same file. Null when the project has none.
	 */
	logo: string | null;
	/** `#rrggbb`, read out of the mark. A tint, never a palette. */
	color: string | null;
	/** How many are on this project, Amy counted; the target is eight. Absent on older snapshots. */
	team?: number;
	/** Whether the project names a team of its own. Absent on older snapshots. */
	team_named?: boolean;
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

export interface Attend {
	id: number;
	kind: string;
	subject: string;
	detail: string;
	at: string;
}

export interface Decided {
	at: string;
	handle: string;
	project: string;
	verdict: 'started' | 'withheld' | 'refused' | 'deferred' | 'coalesced';
	reason: string;
	repeats: number;
}

/**
 * What the browser asked the machine for, and what it said back.
 *
 * `state` is the honest part. A card does not move because this page asked; it
 * moves when the machine answers. `pending` and `delivered` both mean "asked";
 * `applied` and `refused` are the machine's own words, and a refusal carries
 * the reason — "autonomy is off here", "quiet hours", "the weekly window is at
 * 48% against a 40% ceiling".
 */
export interface AskedFor {
	id: string;
	kind: string;
	payload: Record<string, unknown>;
	created_at: number;
	created_by: string;
	state: 'pending' | 'delivered' | 'applied' | 'refused' | 'expired';
	detail: string | null;
}

/**
 * The switchboard: what is off for the fleet, and every project and character
 * carrying an override. Absent on a snapshot from a local half that predates
 * 2026-09-06. A phone may switch a capability off, pause a project, or lower
 * the dial — never the reverse; the local half refuses it by name.
 */
export interface Switches {
	off: string[];
	/** Every capability there is, as `[name, what it gates]`. */
	capabilities: [string, string][];
	projects: {
		name: string;
		focus: string;
		autonomy: string | null;
		off: string[];
		merge: string | null;
		/** The project's own team, when it names one. Absent on older snapshots. */
		team?: string[];
	}[];
	/**
	 * The team templates the roster makes, for one click: what to call it,
	 * what it is for, who it names, and how big the team will be with Amy
	 * counted. Absent on older snapshots.
	 */
	templates?: { key: string; name: string; what: string; members: string[]; size: number }[];
	characters: { handle: string; autonomy: string | null; off: string[] }[];
}

export interface Board {
	schema: number;
	generated_at: string;
	machine: string;
	index_age_seconds: number;
	meters: Meters | null;
	projects: Project[];
	/** Null when dirac's pr-watch has never written a board on that machine. */
	pull_requests: Prs | null;
	actors: Actor[];
	characters: Character[];
	reconciled: Reconciled;
	autonomy: 'off' | 'propose' | 'supervised' | 'autonomous';
	paused_until: string | null;
	switches?: Switches;
	gate_ok: boolean;
	gate_detail: string;
	attention: Attend[];
	decisions: Decided[];
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
		pull_requests: null,
		actors: [],
		characters: [],
		reconciled: { local: 0, remote: 0, matched: 0, ghosts: 0, orphans: 0, ambiguous: 0 },
		autonomy: 'off',
		paused_until: null,
		gate_ok: false,
		gate_detail: 'no snapshot has reached this Worker',
		attention: [],
		decisions: [],
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

/** What the dial means, in the words `apollo autonomy` uses. */
export function autonomyMeans(level: Board['autonomy']): string {
	switch (level) {
		case 'off':
			return 'nothing starts itself';
		case 'propose':
			return 'writes down what it would have started; starts nothing';
		case 'supervised':
			return 'starts work that cannot write; anything that writes waits for you';
		case 'autonomous':
			return 'starts work that writes to a branch; never merges, never deploys';
	}
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

/**
 * The two brand fields, checked before they touch the DOM. The snapshot is
 * trusted enough to render, not enough to write an arbitrary `style` from: a
 * colour is six hex digits and a logo is an image `data:` URI, or nothing.
 */
export function brandOf(p: Pick<Project, 'logo' | 'color'> | null | undefined): {
	logo: string | null;
	color: string | null;
} {
	if (!p) return { logo: null, color: null };
	const color = p.color && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color.toLowerCase() : null;
	const logo =
		p.logo && /^data:image\/(svg\+xml|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.logo)
			? p.logo
			: null;
	return { logo, color };
}
