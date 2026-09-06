<script lang="ts">
	import type { PageData } from './$types';
	import {
		ago,
		autonomyMeans,
		projectSummary,
		shortModel,
		SCHEMA,
		brandOf,
		type Actor,
		type AskedFor,
		type PrCard,
		type Project
	} from '$lib/board';

	let { data }: { data: PageData } = $props();
	const board = $derived(data.board);

	type Card = { kind: 'project'; project: Project } | { kind: 'actor'; actor: Actor };

	const lanes = $derived([
		{
			key: 'needs_you',
			title: 'Needs you',
			cards: board.projects
				.filter((p) => p.lane === 'needs_you')
				.map((p) => ({ kind: 'project', project: p }) as Card)
		},
		{
			key: 'unpushed',
			title: 'Unpushed',
			cards: board.projects
				.filter((p) => p.lane === 'unpushed')
				.map((p) => ({ kind: 'project', project: p }) as Card)
		},
		{
			key: 'in_flight',
			title: 'In flight',
			cards: board.actors.map((a) => ({ kind: 'actor', actor: a }) as Card)
		},
		{
			key: 'quiet',
			title: 'Quiet',
			cards: board.projects
				.filter((p) => p.lane === 'quiet')
				.map((p) => ({ kind: 'project', project: p }) as Card)
		}
	]);

	// One tab is visible at a time on a phone; every lane is a column on a wide
	// screen. plans/surfaces.md §1 — the desktop board is the same application
	// at a wider breakpoint, not a second one.
	let tab = $state(0);
	let selected: Card | null = $state(null);

	const meters = $derived(board.meters);

	/* ── open pull requests ───────────────────────────────────────────────────
	 *
	 * Two piles only, because a phone screen is not a triage tool: what David
	 * can move himself, and what is stuck on someone else. Drafts and the
	 * decade-old stale ones are counted, never listed — a board that shows a
	 * 2015 Gitter-badge PR every time teaches you to scroll past the section.
	 *
	 * The order is the one the local half sent. Re-sorting here is how two
	 * surfaces come to disagree about which pull request matters most.
	 */
	const prs = $derived(board.pull_requests);
	const prMine = $derived(
		(prs?.cards ?? []).filter((c: PrCard) => c.bucket === 'ready' || c.bucket === 'waiting_on_you')
	);
	const prStuck = $derived(
		(prs?.cards ?? []).filter(
			(c: PrCard) =>
				c.bucket === 'checks_red' || c.bucket === 'conflicts' || c.bucket === 'changes_requested'
		)
	);
	/* What the fleet said about a card, and a person's standing order on it,
	 * both keyed by the card. A verdict is a run that read the diff; the bucket
	 * is the checks. They answer different questions and both are shown. */
	const prVerdict = $derived(new Map((prs?.verdicts ?? []).map((v) => [v.key, v])));
	const prOrder = $derived(new Map((prs?.orders ?? []).map((o) => [o.key, o])));
	const verdictWord: Record<string, string> = {
		good: 'good',
		'needs-work': 'needs work',
		bad: 'bad'
	};
	/* Open on a wide screen, folded on a phone. Fourteen rows of pull requests
	 * above the lanes put the board itself two screens down on a phone; the
	 * summary line still says how many you can move and how many are stuck,
	 * which is the part that has to be visible without a tap. */
	let prsOpen = $state(
		typeof window !== 'undefined' && window.matchMedia('(min-width: 62rem)').matches
	);
	const prWhy: Record<string, string> = {
		ready: 'ready',
		waiting_on_you: 'your review',
		checks_red: 'CI failing',
		conflicts: 'conflicts',
		changes_requested: 'changes requested'
	};

	/* ── the write half ──────────────────────────────────────────────────────
	 *
	 * The rule this UI has to tell the truth about: **asking is not doing.**
	 *
	 * plans/dirac-bridge.md §4 — Apollo may request work, it may never
	 * authorise it. So a button here does not move a card. It writes down that
	 * somebody asked; the daemon collects it; the local conductor decides under
	 * David's dial, the gate, the quota and the fleet switches. The card moves
	 * when the *machine* says it moved, and if the machine says no it says why.
	 *
	 * The temptation is an optimistic update — move the card, look responsive,
	 * reconcile later. That would be a lie roughly half the time on a fleet
	 * whose whole point is that it refuses things, and the refusals are the
	 * interesting part. So: `asked` is its own state, visibly not `done`.
	 */
	let asked: AskedFor[] = $state([]);
	let asking = $state(false);
	let askError: string | null = $state(null);
	let askCharacter = $state('');

	async function refreshAsked() {
		try {
			const r = await fetch('/api/intents');
			if (!r.ok) return;
			asked = ((await r.json()) as { intents: AskedFor[] }).intents ?? [];
		} catch {
			/* offline is a normal state for this page */
		}
	}

	async function ask(kind: string, payload: Record<string, unknown>) {
		asking = true;
		askError = null;
		try {
			const r = await fetch('/api/intents', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind, payload })
			});
			const body = (await r.json()) as { error?: string; intent?: AskedFor };
			if (!r.ok || body.error) {
				askError = body.error ?? `the request was refused (${r.status})`;
				return;
			}
			if (body.intent) asked = [body.intent, ...asked];
		} catch (e) {
			askError = e instanceof Error ? e.message : String(e);
		} finally {
			asking = false;
		}
	}

	$effect(() => {
		refreshAsked();
	});

	const canStart = $derived(board.autonomy === 'supervised' || board.autonomy === 'autonomous');
	/* The levels below the current one, highest first: the phone may lower
	 * the dial and never raise it, so these are the only buttons it gets. */
	const dialOrder = ['off', 'propose', 'supervised', 'autonomous'] as const;
	const lowerTo = $derived(
		dialOrder.slice(0, Math.max(0, dialOrder.indexOf(board.autonomy))).reverse()
	);
	const paused = $derived(!!board.paused_until && Date.parse(board.paused_until) > Date.now());

	function accent(c: Card): string {
		if (c.kind === 'actor') return c.actor.state === 'working' ? 'green' : 'dim';
		if (c.project.error) return 'red';
		if (c.project.dirty > 0) return 'amber';
		if (c.project.ahead > 0) return 'cyan';
		return 'green';
	}

	function title(c: Card): string {
		return c.kind === 'actor' ? c.actor.name : c.project.name;
	}

	/* A session card wears the mark of the project it is sitting in. The
	 * actor carries only its home path; the project row for that path carries
	 * the logo, so the join happens here rather than twice in the snapshot. */
	function brand(c: Card): { logo: string | null; color: string | null } {
		if (c.kind === 'project') return brandOf(c.project);
		return brandOf(board.projects.find((p) => p.path === c.actor.home));
	}

	function brandStyle(c: Card): string | undefined {
		const b = brand(c);
		return b.color ? `--brand: ${b.color}` : undefined;
	}

	function sub(c: Card): string {
		return c.kind === 'actor'
			? `${shortModel(c.actor.model)} · pid ${c.actor.pid}`
			: projectSummary(c.project);
	}

	function detail(c: Card): [string, string][] {
		if (c.kind === 'actor') {
			const a = c.actor;
			return [
				['home', a.home],
				['model', a.model ?? 'unknown'],
				['character', a.character ?? '— (David at a terminal)'],
				['state', a.state],
				['last activity', a.last_activity ? `${ago(a.last_activity)} ago` : 'unknown'],
				['running for', a.started_at ? `${ago(a.started_at)}` : '—'],
				['doing', a.doing ?? '—']
			];
		}
		const p = c.project;
		return [
			['path', p.path],
			['branch', p.branch ?? '—'],
			['remote', p.remote ?? 'none'],
			['worktree', p.dirty === 0 ? 'clean' : `${p.dirty} changed`],
			['ahead / behind', `${p.ahead} / ${p.behind}`],
			['sessions', String(p.sessions)],
			['last commit', p.last_commit_at ? `${ago(p.last_commit_at)} ago` : '—'],
			...(p.last_commit_summary ? ([['', p.last_commit_summary]] as [string, string][]) : []),
			...(p.error ? ([['error', p.error]] as [string, string][]) : [])
		];
	}
</script>

<svelte:head>
	<title>Apollo — board</title>
</svelte:head>

<div class="apollo-board">
	<header>
		<div class="brand">
			<span class="mark">A</span>
			<span class="name">Apollo</span>
			<span class="machine">{board.machine}</span>
		</div>
		<div class="meters">
			{#if meters}
				<span class="chip" class:hot={meters.five_hour > 70}
					>5h <b>{meters.five_hour.toFixed(0)}%</b></span
				>
				<span class="chip">weekly <b>{meters.weekly_all.toFixed(0)}%</b></span>
				<span
					class="chip"
					class:hot={meters.credits_used / Math.max(meters.credits_limit, 1) > 0.8}
				>
					credits <b
						>{((meters.credits_used / Math.max(meters.credits_limit, 1)) * 100).toFixed(0)}%</b
					>
				</span>
				<span class="chip faint">sample {meters.sample_age_minutes}m old</span>
			{:else}
				<span class="chip faint">no meter sample</span>
			{/if}
			<span class="chip live"><i></i>{board.actors.length} running</span>
			<span class="chip dial {board.autonomy}" title={autonomyMeans(board.autonomy)}>
				{board.autonomy}
			</span>
			<span class="chip" class:hot={!board.gate_ok} title={board.gate_detail}>
				gate <b>{board.gate_ok ? 'ok' : 'no'}</b>
			</span>
			{#if paused}
				<span class="chip hot"
					>paused until {new Date(board.paused_until!).toLocaleTimeString()}</span
				>
			{:else}
				<button class="chip act" disabled={asking} onclick={() => ask('pause', { minutes: 120 })}>
					pause 2h
				</button>
			{/if}
			<!-- The dial can only come down from here. Each button is one step
			     below the current setting; the local half refuses anything else. -->
			{#each lowerTo as level}
				<button
					class="chip act"
					disabled={asking}
					title="lower the dial to {level} — only the machine can raise it again"
					onclick={() => ask('autonomy.lower', { level })}
				>
					lower to {level}
				</button>
			{/each}
		</div>
	</header>

	{#if board.switches}
		<!-- The switchboard, in the one direction a phone may turn it. A switch
		     that is on can be turned off from here; turning one back on is the
		     machine's alone, so an off switch shows as off and offers nothing. -->
		<section class="switches">
			<h2>The fleet may</h2>
			<div class="caps">
				{#each board.switches.capabilities as [name, what] (name)}
					{@const off = board.switches.off.includes(name)}
					<div class="cap" class:off title={what}>
						<span class="n">{name}</span>
						{#if off}
							<span class="s">off · on again only at the machine</span>
						{:else}
							<button
								class="chip act"
								disabled={asking}
								onclick={() => ask('switch.off', { capability: name })}
							>
								switch off
							</button>
						{/if}
					</div>
				{/each}
			</div>
			{#if board.switches.projects.length > 0 || board.switches.characters.length > 0}
				<p class="differ">
					{#each board.switches.projects as p (p.name)}
						<span class="d"
							><b>{p.name}</b>
							{#if p.focus !== 'normal'}
								· {p.focus}{/if}
							{#if p.autonomy}
								· capped at {p.autonomy}{/if}
							{#if p.off.length > 0}
								· off: {p.off.join(', ')}{/if}
							{#if p.merge}
								· merge {p.merge}{/if}
							{#if p.team && p.team.length > 0}
								· team: {p.team.join(', ')}{/if}</span
						>
					{/each}
					{#each board.switches.characters as c (c.handle)}
						<span class="d"
							><b>{c.handle}</b>
							{#if c.autonomy}
								· capped at {c.autonomy}{/if}
							{#if c.off.length > 0}
								· off: {c.off.join(', ')}{/if}</span
						>
					{/each}
				</p>
			{/if}
		</section>
	{/if}

	{#if board.attention.length > 0}
		<section class="attention">
			<h2>Needs a person<span class="count">{board.attention.length}</span></h2>
			{#each board.attention as a}
				<div class="item {a.kind}">
					<span class="k">{a.kind}</span>
					<span class="s">{a.subject}</span>
					<span class="d">{a.detail}</span>
					<button
						class="seen"
						disabled={asking}
						onclick={() => ask('attention.resolve', { id: a.id })}>mark seen</button
					>
				</div>
			{/each}
		</section>
	{/if}

	{#if prs}
		<details class="prs" bind:open={prsOpen}>
			<summary>
				<h2>
					Open pull requests<span class="count">{prs.counts.open ?? 0}</span>
					<span class="age">{ago(prs.generated_at)}</span>
				</h2>
				<span class="piles-line">
					<b class:some={prMine.length > 0}>{prMine.length}</b> you can move ·
					<b class:stuck={prStuck.length > 0}>{prStuck.length}</b> stuck
				</span>
			</summary>

			{#if prs.stale}
				<p class="warn-line">
					This is {ago(prs.generated_at)} — pr-watch runs every six hours, so it has missed a pass.
				</p>
			{/if}
			{#if prs.unsearchable_scopes.length > 0}
				<p class="warn-line">
					{prs.unsearchable_scopes.join(', ')} could not be searched on that pass; anything open there
					is missing from this list.
				</p>
			{/if}

			{#if prMine.length === 0 && prStuck.length === 0}
				<p class="none">Nothing open that needs a person.</p>
			{/if}

			<div class="piles">
				<div class="pile">
					{#each prMine as c (c.key)}
						<a class="pr yours" href={c.url} target="_blank" rel="noreferrer">
							<span class="w">{prWhy[c.bucket] ?? c.bucket}</span>
							<span class="t">{c.title}</span>
							<span class="m"
								>{c.repo}#{c.number} · {c.author} · {c.age_days}d{#if c.review === 'APPROVED'}
									· approved{/if}</span
							>
							{#if prVerdict.get(c.key)}
								{@const v = prVerdict.get(c.key)!}
								<span class="v {v.word}" title={v.summary}
									>{verdictWord[v.word] ?? v.word} · {v.by}</span
								>
							{/if}
							{#if prOrder.get(c.key)}
								<span class="v order">merges when green · {prOrder.get(c.key)!.how}</span>
							{/if}
						</a>
					{/each}
				</div>
				<div class="pile">
					{#each prStuck as c (c.key)}
						<a class="pr stuck" href={c.url} target="_blank" rel="noreferrer">
							<span class="w">{prWhy[c.bucket] ?? c.bucket}</span>
							<span class="t">{c.title}</span>
							<span class="m">{c.repo}#{c.number} · {c.author} · {c.age_days}d</span>
							{#if prVerdict.get(c.key)}
								{@const v = prVerdict.get(c.key)!}
								<span class="v {v.word}" title={v.summary}
									>{verdictWord[v.word] ?? v.word} · {v.by}</span
								>
							{/if}
							{#if prOrder.get(c.key)}
								<span class="v order">merges when green · {prOrder.get(c.key)!.how}</span>
							{/if}
						</a>
					{/each}
				</div>
			</div>

			{#if (prs.counts.draft ?? 0) + (prs.counts.stale ?? 0) > 0}
				<p class="none">
					Also {prs.counts.draft ?? 0} draft and {prs.counts.stale ?? 0} untouched for 90 days — not
					listed.
				</p>
			{/if}
		</details>
	{/if}

	{#if board.schema !== SCHEMA}
		<p class="warn">
			This snapshot is schema {board.schema}; this page reads {SCHEMA}. Some of it may be missing
			rather than wrong — update one half.
		</p>
	{/if}

	<nav class="tabs">
		{#each lanes as lane, i}
			<button class:on={tab === i} onclick={() => (tab = i)}>
				{lane.title}<span class="count">{lane.cards.length}</span>
			</button>
		{/each}
	</nav>

	<div class="columns">
		{#each lanes as lane, i}
			<section class="lane" class:hidden-on-phone={tab !== i}>
				<h2>{lane.title}<span class="count">{lane.cards.length}</span></h2>
				<div class="cards">
					{#each lane.cards as card}
						{@const b = brand(card)}
						<button
							class="card {accent(card)}"
							class:selected={selected === card}
							class:branded={!!b.color}
							style={brandStyle(card)}
							onclick={() => (selected = selected === card ? null : card)}
						>
							<span class="face">
								{#if b.logo}
									<img src={b.logo} alt="" />
								{:else}
									<span class="initial">{title(card).slice(0, 1)}</span>
								{/if}
							</span>
							<span class="text">
								<span class="t">{title(card)}</span>
								<span class="s">{sub(card)}</span>
								{#if card.kind === 'actor' && card.actor.doing}
									<span class="doing">{card.actor.doing}</span>
								{/if}
							</span>
						</button>
					{:else}
						<p class="empty">nothing here</p>
					{/each}
				</div>
			</section>
		{/each}

		<aside class="detail" class:open={selected !== null}>
			{#if selected}
				{@const b = brand(selected)}
				<div class="head" class:branded={!!b.color} style={brandStyle(selected)}>
					<span class="face large">
						{#if b.logo}
							<img src={b.logo} alt="" />
						{:else}
							<span class="initial">{title(selected).slice(0, 1)}</span>
						{/if}
					</span>
					<div>
						<h3>{title(selected)}</h3>
						<p class="sub">{sub(selected)}</p>
					</div>
				</div>
				<dl>
					{#each detail(selected) as [k, v]}
						<dt>{k}</dt>
						<dd>{v}</dd>
					{/each}
				</dl>
				<button class="close" onclick={() => (selected = null)}>Close</button>
			{:else}
				<p class="hint">Pick a card.</p>
			{/if}
			{#if selected?.kind === 'project'}
				{@const pname = selected.project.name}
				{@const pausedHere = !!board.switches?.projects.find(
					(p) => p.name === pname && p.focus === 'paused'
				)}
				<div class="ask">
					<h4>Switches</h4>
					{#if pausedHere}
						<p class="note">Paused. Nothing starts here until the machine says otherwise.</p>
					{:else}
						<button
							class="do"
							disabled={asking}
							title="nothing starts on this project until it is resumed at the machine"
							onclick={() => ask('project.pause', { project: pname })}
						>
							Pause {pname}
						</button>
					{/if}
					{#if selected.project.team !== undefined}
						{@const over = selected.project.team - 8}
						<p class="note" class:over={over > 0}>
							Team of {selected.project.team}{#if over > 0}, {over} over the target of 8{/if}.
							{#if selected.project.team_named}Named in fleet.toml.{:else}The fleet's lists decide.{/if}
						</p>
					{/if}
					{#if board.switches?.templates && board.switches.templates.length > 0 && !pausedHere}
						<div class="row">
							{#each board.switches.templates as t (t.key)}
								<button
									class="do"
									disabled={asking}
									title="{t.what} — {t.members.join(', ')}"
									onclick={() => ask('team.set', { project: pname, template: t.key })}
								>
									{t.name}
									{t.size}
								</button>
							{/each}
						</div>
						<p class="hint">
							One click names the team from among who is on now. The machine refuses one that would
							put somebody on.
						</p>
					{/if}
				</div>
				<div class="ask">
					<h4>Ask for work on this</h4>
					<label>
						<span>character</span>
						<select bind:value={askCharacter}>
							<option value="">choose…</option>
							{#each board.characters as c}
								<option value={c.handle}>{c.display} — {c.wakes}</option>
							{/each}
						</select>
					</label>
					<button
						class="do"
						disabled={!askCharacter || asking}
						onclick={() =>
							selected?.kind === 'project' &&
							ask('work.request', {
								project: selected.project.name,
								character: askCharacter,
								note: 'asked from the board'
							})}
					>
						{asking ? 'asking…' : 'Ask'}
					</button>
					{#if askError}<p class="err">{askError}</p>{/if}
					<p class="note">
						This asks. It does not start anything. The machine decides — under the dial, the gate,
						the quota and the fleet switches — and answers below.
						{#if !canStart}
							Autonomy is <b>{board.autonomy}</b>, so this will be recorded and refused until the
							dial is turned at the terminal.
						{/if}
					</p>
				</div>
			{/if}
		</aside>
	</div>

	{#if asked.length > 0}
		<section class="asked">
			<h2>Asked for</h2>
			{#each asked.slice(0, 8) as a}
				<div class="row {a.state}">
					<span class="st">{a.state}</span>
					<span class="kd">{a.kind}</span>
					<span class="pl">
						{a.payload.project ?? ''}
						{a.payload.character ? `· ${a.payload.character}` : ''}
					</span>
					<span class="dt">{a.detail ?? 'waiting for the machine to collect it'}</span>
				</div>
			{/each}
			<p class="note">
				`applied` and `refused` are the machine's own words. A request nobody collects within a day
				expires rather than waiting forever.
			</p>
		</section>
	{/if}

	{#if board.decisions.length > 0}
		<section class="decisions">
			<h2>What the conductor decided</h2>
			{#each board.decisions.slice(0, 8) as d}
				<div class="row {d.verdict}">
					<span class="st">{d.verdict}</span>
					<span class="kd">{d.handle}</span>
					<span class="pl">{d.project}</span>
					<span class="dt">{d.reason}{d.repeats > 1 ? ` ×${d.repeats}` : ''}</span>
				</div>
			{/each}
			<p class="note">
				Every no is here on purpose. A run that never started is still a fact — otherwise a fleet
				that quietly does less than you think looks exactly like one that is working.
			</p>
		</section>
	{/if}

	<footer>
		<div class="rec">
			<b>{board.reconciled.local}</b> local · <b>{board.reconciled.remote}</b> remote ·
			{board.reconciled.matched} matched · {board.reconciled.ghosts} ghosts ·
			{board.reconciled.orphans} orphans · {board.reconciled.ambiguous} ambiguous
		</div>
		{#each board.caveats as c}
			<p class="caveat">{c}</p>
		{/each}
	</footer>
</div>

<style>
	/* Mobile-first, and sized in rem.
	 *
	 * rem rather than px so a reader who has set a larger default font size in
	 * their browser gets one — page zoom scales pixels, a font preference does
	 * not. Every column and every fixed width lives in a min-width query, so the
	 * narrow case is the case that was written first rather than the one
	 * squeezed in afterwards. And at 200% zoom nothing overlaps, because there
	 * is no fixed-width anything left to overlap with. */
	.apollo-board {
		--void: #05070d;
		--panel: #0b1220;
		--rule: rgba(219, 230, 245, 0.1);
		--rule2: rgba(219, 230, 245, 0.18);
		--bright: #f2f7ff;
		--text: #dbe6f5;
		--dim: #8fa3bd;
		--faint: #64748b;
		--cyan: #59d9ff;
		--amber: #ffb14e;
		--green: #7ad7a0;
		--red: #ff6a4d;
		--violet: #a78bfa;
		--mono: ui-monospace, 'JetBrains Mono', monospace;

		--t-xs: 0.78rem;
		--t-sm: 0.86rem;
		--t-md: 0.95rem;
		--t-lg: 1.1rem;
		--t-xl: 1.3rem;
		--gap: 0.75rem;
		--pad: 1rem;

		min-height: 100vh;
		background:
			radial-gradient(75rem 44rem at 18% -8%, rgba(89, 217, 255, 0.08), transparent 60%),
			var(--void);
		color: var(--text);
		font-family: 'Inter', system-ui, sans-serif;
		font-size: var(--t-md);
		line-height: 1.45;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--gap);
		flex-wrap: wrap;
		padding: 0.8rem var(--pad);
		border-bottom: 1px solid var(--rule);
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 0.55rem;
	}
	.mark {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.5rem;
		align-self: center;
		flex: 0 0 auto;
		background: linear-gradient(140deg, #59d9ff, #3aa8d8);
		color: #04141c;
		font-weight: 800;
		display: grid;
		place-items: center;
	}
	.name {
		font-weight: 650;
		color: var(--bright);
		font-size: var(--t-xl);
	}
	.machine {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--faint);
	}
	.meters {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.chip {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--dim);
		border: 1px solid var(--rule2);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		white-space: nowrap;
	}
	.chip b {
		color: var(--bright);
	}
	.chip.hot {
		border-color: rgba(255, 177, 78, 0.4);
		color: var(--amber);
	}
	.chip.faint {
		color: var(--faint);
	}
	.chip.live {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--green);
		border-color: rgba(122, 215, 160, 0.35);
	}
	.chip.live i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: var(--green);
	}

	.warn {
		margin: 0;
		padding: 0.6rem var(--pad);
		font-size: var(--t-sm);
		color: var(--amber);
		border-bottom: 1px solid rgba(255, 177, 78, 0.25);
	}

	.tabs {
		display: flex;
		gap: 0.4rem;
		padding: 0.7rem var(--pad) 0;
		overflow-x: auto;
	}
	.tabs button {
		font: inherit;
		font-size: var(--t-sm);
		white-space: nowrap;
		min-height: 2.2rem;
		background: transparent;
		color: var(--dim);
		border: 1px solid var(--rule2);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
		cursor: pointer;
	}
	.tabs button.on {
		background: rgba(89, 217, 255, 0.12);
		color: var(--cyan);
		border-color: rgba(89, 217, 255, 0.5);
	}
	.count {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--faint);
		margin-left: 0.45rem;
	}

	.columns {
		flex: 1;
		display: block;
		padding: var(--gap) var(--pad) var(--pad);
	}
	.lane h2 {
		display: none;
	}
	.lane.hidden-on-phone {
		display: none;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.card {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		text-align: left;
		background: linear-gradient(170deg, var(--panel), #080d18);
		border: 1px solid var(--rule);
		border-left: 0.2rem solid var(--dim);
		border-radius: 0.65rem;
		padding: 0.6rem 0.8rem 0.6rem 0.65rem;
		cursor: pointer;
		font: inherit;
		color: inherit;
	}
	.card .text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.card.selected {
		border-color: rgba(89, 217, 255, 0.55);
	}

	/* ── the project's own face ──────────────────────────────────────────────
	 *
	 * The mark the StreamDeck shows for this project, at the size of a favicon,
	 * and its colour as a tint: a few percent into the card's ground and a
	 * little more behind the mark. Subtle on purpose — the left edge already
	 * says what STATE a card is in, and that must stay the loudest colour on it.
	 * A project with no mark gets its initial on the same well, so the column
	 * lines up whether or not a logo was ever drawn. */
	.face {
		--tint: var(--brand, #64748b);
		width: 2.1rem;
		height: 2.1rem;
		flex: 0 0 auto;
		border-radius: 0.55rem;
		display: grid;
		place-items: center;
		overflow: hidden;
		background: color-mix(in srgb, var(--tint) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--tint) 28%, transparent);
	}
	.face img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: 0.22rem;
		box-sizing: border-box;
	}
	.face .initial {
		font-weight: 700;
		font-size: var(--t-sm);
		color: color-mix(in srgb, var(--tint) 80%, white);
	}
	.face.large {
		width: 3rem;
		height: 3rem;
		border-radius: 0.75rem;
	}
	.face.large .initial {
		font-size: var(--t-lg);
	}
	.card.branded {
		background: linear-gradient(
			100deg,
			color-mix(in srgb, var(--brand) 9%, var(--panel)) 0%,
			var(--panel) 40%,
			#080d18 100%
		);
	}
	.card.branded:hover {
		border-color: color-mix(in srgb, var(--brand) 35%, var(--rule));
	}
	.card.green {
		border-left-color: var(--green);
	}
	.card.amber {
		border-left-color: var(--amber);
	}
	.card.cyan {
		border-left-color: var(--cyan);
	}
	.card.red {
		border-left-color: var(--red);
	}
	.card.dim {
		border-left-color: #3b4759;
	}
	.card .t {
		color: var(--bright);
		font-weight: 600;
		font-size: var(--t-md);
	}
	.card .s {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--dim);
	}
	.card .doing {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--cyan);
	}
	.empty {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--faint);
	}

	/* On a phone the detail is a sheet. It never covers the whole screen, so you
	   can still see what you picked it from. */
	.detail {
		position: fixed;
		inset: auto 0 0 0;
		max-height: 72vh;
		overflow: auto;
		background: #080d18;
		border-top: 1px solid rgba(89, 217, 255, 0.35);
		padding: var(--pad);
		transform: translateY(101%);
		transition: transform 0.18s ease;
	}
	.detail.open {
		transform: translateY(0);
	}
	.detail .head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.7rem;
	}
	.detail .head > div {
		min-width: 0;
	}
	.detail h3 {
		margin: 0;
		color: var(--bright);
		font-size: var(--t-lg);
		overflow-wrap: anywhere;
	}
	.detail .sub {
		margin: 0.2rem 0 0;
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--faint);
	}
	dl {
		display: grid;
		grid-template-columns: minmax(6rem, auto) 1fr;
		gap: 0.3rem 0.7rem;
		margin: 0;
		font-family: var(--mono);
		font-size: var(--t-xs);
	}
	dt {
		color: var(--faint);
	}
	dd {
		margin: 0;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.close {
		margin-top: 0.8rem;
		font: inherit;
		font-size: var(--t-sm);
		background: rgba(89, 217, 255, 0.12);
		color: var(--cyan);
		border: 1px solid rgba(89, 217, 255, 0.4);
		border-radius: 0.5rem;
		padding: 0.5rem 0.85rem;
		cursor: pointer;
		min-height: 2.2rem;
	}
	.hint {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--faint);
	}
	.readonly {
		margin-top: 0.8rem;
		font-size: var(--t-xs);
		line-height: 1.5;
		color: var(--faint);
	}

	footer {
		padding: 0.8rem var(--pad) 1.4rem;
		border-top: 1px solid var(--rule);
	}
	.rec {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--dim);
		overflow-wrap: anywhere;
	}
	.rec b {
		color: var(--bright);
	}
	.caveat {
		margin: 0.45rem 0 0;
		font-size: var(--t-xs);
		line-height: 1.5;
		color: var(--faint);
	}

	@media (prefers-reduced-motion: reduce) {
		.detail {
			transition: none;
		}
	}

	/* Wide enough for the lanes side by side. The wide web is a breakpoint, not
	   a project (plans/surfaces.md §8.5). */
	@media (min-width: 62rem) {
		.tabs {
			display: none;
		}
		.columns {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: var(--gap);
			align-items: start;
		}
		.lane.hidden-on-phone {
			display: block;
		}
		.lane {
			background: rgba(11, 18, 32, 0.5);
			border: 1px solid var(--rule);
			border-radius: 0.75rem;
			padding: var(--gap);
			max-height: calc(100vh - 12rem);
			overflow: auto;
		}
		.lane h2 {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin: 0 0 0.6rem;
			font-size: var(--t-xs);
			letter-spacing: 0.16em;
			text-transform: uppercase;
			color: var(--cyan);
			font-weight: 700;
		}
	}

	/* Only once there is genuinely room does the detail become a rail. Between
	   these two widths, four lanes plus a rail is five columns in the space of
	   three — which is how a "responsive" layout ends up unreadable. */
	@media (min-width: 80rem) {
		.columns {
			grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(16rem, 20rem);
		}
		.detail {
			position: sticky;
			top: var(--gap);
			inset: auto;
			transform: none;
			max-height: none;
			border: 1px solid var(--rule);
			border-radius: 0.75rem;
			background: rgba(11, 18, 32, 0.5);
		}
	}

	/* ── the write half ─────────────────────────────────────────────────────
	 *
	 * Every state in here is coloured by what it *means*, not by whether the
	 * click worked. `asked` is amber because it is unfinished; `refused` is red
	 * and keeps its reason on screen; `applied` is the only green. A UI that
	 * greened the button on a successful POST would be reporting that the
	 * browser was heard, which is not the question anyone is asking. */
	.chip.act {
		font: inherit;
		font-family: var(--mono);
		font-size: var(--t-xs);
		background: transparent;
		color: var(--dim);
		cursor: pointer;
		border: 1px solid var(--rule2);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		min-height: 2rem;
	}
	.chip.act:hover:not(:disabled) {
		color: var(--amber);
		border-color: rgba(255, 177, 78, 0.5);
	}
	.chip.act:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.chip.dial {
		text-transform: lowercase;
		letter-spacing: 0.04em;
	}
	.chip.dial.off {
		color: var(--faint);
	}
	.chip.dial.propose {
		color: var(--cyan);
		border-color: rgba(89, 217, 255, 0.4);
	}
	.chip.dial.supervised {
		color: var(--green);
		border-color: rgba(122, 215, 160, 0.4);
	}
	.chip.dial.autonomous {
		color: var(--amber);
		border-color: rgba(255, 177, 78, 0.5);
	}

	/* ── the switchboard ────────────────────────────────────────────────────── */
	.switches {
		padding: 0.6rem 0 0.2rem;
		border-bottom: 1px solid var(--rule);
	}
	.switches h2 {
		font-size: var(--t-xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--faint);
		margin: 0 0 0.4rem;
	}
	.switches .caps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
	}
	.switches .cap {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--mono);
		font-size: var(--t-xs);
		padding: 0.15rem 0.45rem;
		border: 1px solid var(--rule);
		border-radius: 1rem;
	}
	.switches .cap.off {
		color: var(--faint);
		text-decoration: line-through;
	}
	.switches .cap .s {
		text-decoration: none;
		color: var(--faint);
	}
	.switches .differ {
		margin: 0.45rem 0 0;
		font-size: var(--t-xs);
		color: var(--dim);
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}

	.prs,
	.attention,
	.asked,
	.decisions {
		padding: 0.8rem var(--pad);
		border-bottom: 1px solid var(--rule);
	}
	.prs h2,
	.attention h2,
	.asked h2,
	.decisions h2 {
		margin: 0 0 0.5rem;
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--dim);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.attention .item {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.45rem 0;
		border-top: 1px solid var(--rule);
		font-size: var(--t-sm);
	}
	.attention .k {
		font-family: var(--mono);
		font-size: var(--t-xs);
		text-transform: uppercase;
		color: var(--amber);
		min-width: 5rem;
	}
	.attention .item.gate .k,
	.attention .item.failure .k {
		color: var(--red);
	}
	.attention .s {
		color: var(--bright);
		font-weight: 600;
	}
	.attention .d {
		color: var(--dim);
		flex: 1 1 14rem;
	}
	.attention .seen {
		font: inherit;
		font-size: var(--t-xs);
		background: transparent;
		color: var(--faint);
		border: 1px solid var(--rule2);
		border-radius: 999px;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		min-height: 1.9rem;
	}
	.attention .seen:hover:not(:disabled) {
		color: var(--cyan);
	}

	.prs h2 .age {
		margin-left: 0.5rem;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
		color: var(--faint);
	}
	/* The section folds. The summary is the part that must read without a tap:
	   the two counts, coloured only when they are not zero. */
	.prs summary {
		list-style: none;
		cursor: pointer;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.9rem;
		min-height: 2.2rem;
	}
	.prs summary::-webkit-details-marker {
		display: none;
	}
	.prs summary h2 {
		margin: 0;
	}
	.prs summary h2::before {
		content: '▸';
		display: inline-block;
		width: 1rem;
		color: var(--faint);
		transition: transform 0.15s ease;
	}
	.prs[open] summary h2::before {
		transform: rotate(90deg);
	}
	.prs .piles-line {
		font-family: var(--mono);
		font-size: var(--t-xs);
		color: var(--faint);
	}
	.prs .piles-line b {
		font-weight: 600;
		color: var(--dim);
	}
	.prs .piles-line b.some {
		color: var(--amber);
	}
	.prs .piles-line b.stuck {
		color: var(--red);
	}
	.prs .piles {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0 1.5rem;
		margin-top: 0.4rem;
	}
	.prs .pile:empty {
		display: none;
	}
	/* Side by side once there is room: what you can move, what is stuck. */
	@media (min-width: 62rem) {
		.prs .piles {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
	.prs .warn-line {
		margin: 0 0 0.4rem;
		font-size: var(--t-xs);
		color: var(--amber);
	}
	.prs .none {
		margin: 0.35rem 0 0;
		font-size: var(--t-xs);
		color: var(--faint);
	}
	.pr {
		display: grid;
		grid-template-columns: 7.5rem 1fr;
		gap: 0.15rem 0.6rem;
		padding: 0.45rem 0;
		border-top: 1px solid var(--rule);
		font-size: var(--t-sm);
		text-decoration: none;
		color: inherit;
	}
	.pr:hover .t {
		color: var(--cyan);
	}
	.pr .w {
		grid-row: span 2;
		font-family: var(--mono);
		font-size: var(--t-xs);
		text-transform: uppercase;
		color: var(--amber);
	}
	.pr.stuck .w {
		color: var(--red);
	}
	.pr .t {
		color: var(--bright);
		font-weight: 600;
	}
	.pr .m {
		font-size: var(--t-xs);
		color: var(--dim);
	}
	/* What read the diff said, and a standing order. Second column, under
	 * the meta line, so the bucket word on the left stays the loudest thing. */
	.pr .v {
		grid-column: 2;
		font-family: var(--mono);
		font-size: var(--t-xs);
		letter-spacing: 0.04em;
		color: var(--faint);
	}
	.pr .v.good {
		color: var(--green);
	}
	.pr .v.needs-work {
		color: var(--amber);
	}
	.pr .v.bad {
		color: var(--red);
	}
	.pr .v.order {
		color: var(--cyan, var(--dim));
	}
	/* One column on a phone: a 7.5rem label beside a title leaves no title. */
	@media (max-width: 30rem) {
		.pr {
			grid-template-columns: 1fr;
		}
		.pr .w {
			grid-row: auto;
		}
	}

	.asked .row,
	.decisions .row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0.35rem 0;
		border-top: 1px solid var(--rule);
		font-size: var(--t-sm);
	}
	.asked .st,
	.decisions .st {
		font-family: var(--mono);
		font-size: var(--t-xs);
		min-width: 5.5rem;
		text-transform: uppercase;
		color: var(--amber);
	}
	.asked .row.applied .st,
	.decisions .row.started .st {
		color: var(--green);
	}
	.asked .row.refused .st,
	.decisions .row.refused .st {
		color: var(--red);
	}
	.asked .row.expired .st,
	.decisions .row.coalesced .st {
		color: var(--faint);
	}
	.decisions .row.withheld .st {
		color: var(--cyan);
	}
	.asked .kd,
	.decisions .kd {
		color: var(--bright);
		font-family: var(--mono);
		font-size: var(--t-xs);
	}
	.asked .pl,
	.decisions .pl {
		color: var(--dim);
	}
	.asked .dt,
	.decisions .dt {
		color: var(--faint);
		flex: 1 1 12rem;
	}
	.note {
		margin: 0.5rem 0 0;
		font-size: var(--t-xs);
		color: var(--faint);
		line-height: 1.5;
	}

	.ask {
		border-top: 1px solid var(--rule);
		margin-top: 0.9rem;
		padding-top: 0.9rem;
	}
	.ask h4 {
		margin: 0 0 0.6rem;
		font-size: var(--t-sm);
		color: var(--dim);
	}
	.ask label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.6rem;
	}
	.ask label span {
		font-size: var(--t-xs);
		color: var(--faint);
		font-family: var(--mono);
	}
	.ask select {
		font: inherit;
		font-size: var(--t-sm);
		min-height: 2.4rem;
		background: var(--void);
		color: var(--text);
		border: 1px solid var(--rule2);
		border-radius: 0.4rem;
		padding: 0.35rem 0.5rem;
	}
	.ask .row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.note.over {
		color: var(--amber, #ffb14e);
	}
	.ask .do {
		font: inherit;
		font-size: var(--t-sm);
		min-height: 2.4rem;
		width: 100%;
		background: rgba(89, 217, 255, 0.12);
		color: var(--cyan);
		border: 1px solid rgba(89, 217, 255, 0.5);
		border-radius: 0.4rem;
		cursor: pointer;
	}
	.ask .do:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.ask .err {
		margin: 0.5rem 0 0;
		font-size: var(--t-xs);
		color: var(--red);
	}
</style>
