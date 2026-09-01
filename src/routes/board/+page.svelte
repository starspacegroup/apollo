<script lang="ts">
	import type { PageData } from './$types';
	import { ago, projectSummary, shortModel, SCHEMA, type Actor, type Project } from '$lib/board';

	let { data }: { data: PageData } = $props();
	const board = $derived(data.board);

	type Card =
		| { kind: 'project'; project: Project }
		| { kind: 'actor'; actor: Actor };

	const lanes = $derived([
		{
			key: 'needs_you',
			title: 'Needs you',
			cards: board.projects.filter((p) => p.lane === 'needs_you').map((p) => ({ kind: 'project', project: p }) as Card)
		},
		{
			key: 'unpushed',
			title: 'Unpushed',
			cards: board.projects.filter((p) => p.lane === 'unpushed').map((p) => ({ kind: 'project', project: p }) as Card)
		},
		{
			key: 'in_flight',
			title: 'In flight',
			cards: board.actors.map((a) => ({ kind: 'actor', actor: a }) as Card)
		},
		{
			key: 'quiet',
			title: 'Quiet',
			cards: board.projects.filter((p) => p.lane === 'quiet').map((p) => ({ kind: 'project', project: p }) as Card)
		}
	]);

	// One tab is visible at a time on a phone; every lane is a column on a wide
	// screen. plans/surfaces.md §1 — the desktop board is the same application
	// at a wider breakpoint, not a second one.
	let tab = $state(0);
	let selected: Card | null = $state(null);

	const meters = $derived(board.meters);

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
				<span class="chip" class:hot={meters.five_hour > 70}>5h <b>{meters.five_hour.toFixed(0)}%</b></span>
				<span class="chip">weekly <b>{meters.weekly_all.toFixed(0)}%</b></span>
				<span class="chip" class:hot={meters.credits_used / Math.max(meters.credits_limit, 1) > 0.8}>
					credits <b>{((meters.credits_used / Math.max(meters.credits_limit, 1)) * 100).toFixed(0)}%</b>
				</span>
				<span class="chip faint">sample {meters.sample_age_minutes}m old</span>
			{:else}
				<span class="chip faint">no meter sample</span>
			{/if}
			<span class="chip live"><i></i>{board.actors.length} running</span>
		</div>
	</header>

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
						<button
							class="card {accent(card)}"
							class:selected={selected === card}
							onclick={() => (selected = selected === card ? null : card)}
						>
							<span class="t">{title(card)}</span>
							<span class="s">{sub(card)}</span>
							{#if card.kind === 'actor' && card.actor.doing}
								<span class="doing">{card.actor.doing}</span>
							{/if}
						</button>
					{:else}
						<p class="empty">nothing here</p>
					{/each}
				</div>
			</section>
		{/each}

		<aside class="detail" class:open={selected !== null}>
			{#if selected}
				<h3>{title(selected)}</h3>
				<p class="sub">{sub(selected)}</p>
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
			<p class="readonly">
				Read-only. A column move needs the write half, and starting a run needs the bridge —
				neither exists yet, so this board changes nothing.
			</p>
		</aside>
	</div>

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
	.brand { display: flex; align-items: baseline; gap: 0.55rem; }
	.mark {
		width: 1.75rem; height: 1.75rem; border-radius: 0.5rem; align-self: center; flex: 0 0 auto;
		background: linear-gradient(140deg, #59d9ff, #3aa8d8);
		color: #04141c; font-weight: 800; display: grid; place-items: center;
	}
	.name { font-weight: 650; color: var(--bright); font-size: var(--t-xl); }
	.machine { font-family: var(--mono); font-size: var(--t-xs); color: var(--faint); }
	.meters { display: flex; gap: 0.4rem; flex-wrap: wrap; }
	.chip {
		font-family: var(--mono); font-size: var(--t-xs); color: var(--dim);
		border: 1px solid var(--rule2); border-radius: 999px; padding: 0.3rem 0.7rem; white-space: nowrap;
	}
	.chip b { color: var(--bright); }
	.chip.hot { border-color: rgba(255, 177, 78, 0.4); color: var(--amber); }
	.chip.faint { color: var(--faint); }
	.chip.live { display: flex; align-items: center; gap: 0.45rem; color: var(--green); border-color: rgba(122, 215, 160, 0.35); }
	.chip.live i { width: 0.4rem; height: 0.4rem; border-radius: 50%; background: var(--green); }

	.warn {
		margin: 0; padding: 0.6rem var(--pad); font-size: var(--t-sm); color: var(--amber);
		border-bottom: 1px solid rgba(255, 177, 78, 0.25);
	}

	.tabs { display: flex; gap: 0.4rem; padding: 0.7rem var(--pad) 0; overflow-x: auto; }
	.tabs button {
		font: inherit; font-size: var(--t-sm); white-space: nowrap; min-height: 2.2rem;
		background: transparent; color: var(--dim);
		border: 1px solid var(--rule2); border-radius: 999px; padding: 0.4rem 0.85rem; cursor: pointer;
	}
	.tabs button.on { background: rgba(89, 217, 255, 0.12); color: var(--cyan); border-color: rgba(89, 217, 255, 0.5); }
	.count { font-family: var(--mono); font-size: var(--t-xs); color: var(--faint); margin-left: 0.45rem; }

	.columns { flex: 1; display: block; padding: var(--gap) var(--pad) var(--pad); }
	.lane h2 { display: none; }
	.lane.hidden-on-phone { display: none; }
	.cards { display: flex; flex-direction: column; gap: 0.5rem; }

	.card {
		display: flex; flex-direction: column; gap: 0.2rem; text-align: left;
		background: linear-gradient(170deg, var(--panel), #080d18);
		border: 1px solid var(--rule); border-left: 0.2rem solid var(--dim);
		border-radius: 0.65rem; padding: 0.65rem 0.8rem; cursor: pointer; font: inherit;
	}
	.card.selected { border-color: rgba(89, 217, 255, 0.55); }
	.card.green { border-left-color: var(--green); }
	.card.amber { border-left-color: var(--amber); }
	.card.cyan { border-left-color: var(--cyan); }
	.card.red { border-left-color: var(--red); }
	.card.dim { border-left-color: #3b4759; }
	.card .t { color: var(--bright); font-weight: 600; font-size: var(--t-md); }
	.card .s { font-family: var(--mono); font-size: var(--t-xs); color: var(--dim); }
	.card .doing { font-family: var(--mono); font-size: var(--t-xs); color: var(--cyan); }
	.empty { font-family: var(--mono); font-size: var(--t-xs); color: var(--faint); }

	/* On a phone the detail is a sheet. It never covers the whole screen, so you
	   can still see what you picked it from. */
	.detail {
		position: fixed; inset: auto 0 0 0; max-height: 72vh; overflow: auto;
		background: #080d18; border-top: 1px solid rgba(89, 217, 255, 0.35);
		padding: var(--pad); transform: translateY(101%); transition: transform 0.18s ease;
	}
	.detail.open { transform: translateY(0); }
	.detail h3 { margin: 0; color: var(--bright); font-size: var(--t-lg); }
	.detail .sub { margin: 0.2rem 0 0.7rem; font-family: var(--mono); font-size: var(--t-xs); color: var(--faint); }
	dl {
		display: grid; grid-template-columns: minmax(6rem, auto) 1fr; gap: 0.3rem 0.7rem;
		margin: 0; font-family: var(--mono); font-size: var(--t-xs);
	}
	dt { color: var(--faint); }
	dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
	.close {
		margin-top: 0.8rem; font: inherit; font-size: var(--t-sm); background: rgba(89, 217, 255, 0.12);
		color: var(--cyan); border: 1px solid rgba(89, 217, 255, 0.4); border-radius: 0.5rem;
		padding: 0.5rem 0.85rem; cursor: pointer; min-height: 2.2rem;
	}
	.hint { font-family: var(--mono); font-size: var(--t-xs); color: var(--faint); }
	.readonly { margin-top: 0.8rem; font-size: var(--t-xs); line-height: 1.5; color: var(--faint); }

	footer { padding: 0.8rem var(--pad) 1.4rem; border-top: 1px solid var(--rule); }
	.rec { font-family: var(--mono); font-size: var(--t-xs); color: var(--dim); overflow-wrap: anywhere; }
	.rec b { color: var(--bright); }
	.caveat { margin: 0.45rem 0 0; font-size: var(--t-xs); line-height: 1.5; color: var(--faint); }

	@media (prefers-reduced-motion: reduce) {
		.detail { transition: none; }
	}

	/* Wide enough for the lanes side by side. The wide web is a breakpoint, not
	   a project (plans/surfaces.md §8.5). */
	@media (min-width: 62rem) {
		.tabs { display: none; }
		.columns {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: var(--gap);
			align-items: start;
		}
		.lane.hidden-on-phone { display: block; }
		.lane {
			background: rgba(11, 18, 32, 0.5);
			border: 1px solid var(--rule); border-radius: 0.75rem; padding: var(--gap);
			max-height: calc(100vh - 12rem); overflow: auto;
		}
		.lane h2 {
			display: flex; align-items: center; justify-content: space-between;
			margin: 0 0 0.6rem; font-size: var(--t-xs); letter-spacing: 0.16em; text-transform: uppercase;
			color: var(--cyan); font-weight: 700;
		}
	}

	/* Only once there is genuinely room does the detail become a rail. Between
	   these two widths, four lanes plus a rail is five columns in the space of
	   three — which is how a "responsive" layout ends up unreadable. */
	@media (min-width: 80rem) {
		.columns { grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(16rem, 20rem); }
		.detail {
			position: sticky; top: var(--gap); inset: auto; transform: none; max-height: none;
			border: 1px solid var(--rule); border-radius: 0.75rem; background: rgba(11, 18, 32, 0.5);
		}
	}
</style>

