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
		min-height: 100vh;
		background:
			radial-gradient(1200px 700px at 18% -8%, rgba(89, 217, 255, 0.08), transparent 60%),
			var(--void);
		color: var(--text);
		font-family: 'Inter', system-ui, sans-serif;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
		padding: 14px 16px;
		border-bottom: 1px solid var(--rule);
	}
	.brand { display: flex; align-items: center; gap: 9px; }
	.mark {
		width: 26px; height: 26px; border-radius: 8px;
		background: linear-gradient(140deg, #59d9ff, #3aa8d8);
		color: #04141c; font-weight: 800; display: grid; place-items: center;
	}
	.name { font-weight: 650; color: var(--bright); font-size: 16px; }
	.machine { font-family: ui-monospace, monospace; font-size: 11px; color: var(--faint); }
	.meters { display: flex; gap: 7px; flex-wrap: wrap; margin-left: auto; }
	.chip {
		font-family: ui-monospace, monospace; font-size: 11.5px; color: var(--dim);
		border: 1px solid var(--rule2); border-radius: 20px; padding: 4px 11px;
	}
	.chip b { color: var(--bright); }
	.chip.hot { border-color: rgba(255, 177, 78, 0.4); color: var(--amber); }
	.chip.faint { color: var(--faint); }
	.chip.live { display: flex; align-items: center; gap: 7px; color: var(--green); border-color: rgba(122,215,160,.35); }
	.chip.live i { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }

	.warn {
		margin: 0; padding: 9px 16px; font-size: 12.5px; color: var(--amber);
		border-bottom: 1px solid rgba(255, 177, 78, 0.25);
	}

	.tabs { display: flex; gap: 6px; padding: 10px 12px; overflow-x: auto; }
	.tabs button {
		font: inherit; font-size: 13px; white-space: nowrap;
		background: transparent; color: var(--dim);
		border: 1px solid var(--rule2); border-radius: 20px; padding: 7px 13px; cursor: pointer;
	}
	.tabs button.on { background: rgba(89, 217, 255, 0.12); color: var(--cyan); border-color: rgba(89,217,255,.5); }
	.count {
		font-family: ui-monospace, monospace; font-size: 11px; color: var(--faint); margin-left: 7px;
	}

	.columns { flex: 1; display: block; padding: 0 12px 16px; }
	.lane h2 { display: none; }
	.lane.hidden-on-phone { display: none; }
	.cards { display: flex; flex-direction: column; gap: 8px; }

	.card {
		display: flex; flex-direction: column; gap: 4px; text-align: left;
		background: linear-gradient(170deg, var(--panel), #080d18);
		border: 1px solid var(--rule); border-left: 3px solid var(--dim);
		border-radius: 10px; padding: 10px 13px; cursor: pointer; font: inherit;
	}
	.card.selected { border-color: rgba(89, 217, 255, 0.55); }
	.card.green { border-left-color: var(--green); }
	.card.amber { border-left-color: var(--amber); }
	.card.cyan { border-left-color: var(--cyan); }
	.card.red { border-left-color: var(--red); }
	.card.dim { border-left-color: #3b4759; }
	.card .t { color: var(--bright); font-weight: 600; font-size: 14.5px; }
	.card .s { font-family: ui-monospace, monospace; font-size: 11.5px; color: var(--dim); }
	.card .doing { font-family: ui-monospace, monospace; font-size: 11px; color: var(--cyan); }
	.empty { font-family: ui-monospace, monospace; font-size: 12px; color: var(--faint); }

	.detail {
		position: fixed; inset: auto 0 0 0; max-height: 72vh; overflow: auto;
		background: #080d18; border-top: 1px solid rgba(89, 217, 255, 0.35);
		padding: 16px; transform: translateY(101%); transition: transform 0.18s ease;
	}
	.detail.open { transform: translateY(0); }
	.detail h3 { margin: 0; color: var(--bright); font-size: 17px; }
	.detail .sub { margin: 3px 0 12px; font-family: ui-monospace, monospace; font-size: 12px; color: var(--faint); }
	dl { display: grid; grid-template-columns: 120px 1fr; gap: 5px 12px; margin: 0; font-family: ui-monospace, monospace; font-size: 12px; }
	dt { color: var(--faint); }
	dd { margin: 0; color: var(--text); word-break: break-word; }
	.close {
		margin-top: 14px; font: inherit; font-size: 13px; background: rgba(89,217,255,.12);
		color: var(--cyan); border: 1px solid rgba(89,217,255,.4); border-radius: 8px; padding: 8px 14px; cursor: pointer;
	}
	.hint { font-family: ui-monospace, monospace; font-size: 12px; color: var(--faint); }
	.readonly { margin-top: 14px; font-size: 12px; line-height: 1.5; color: var(--faint); }

	footer { padding: 14px 16px 22px; border-top: 1px solid var(--rule); }
	.rec { font-family: ui-monospace, monospace; font-size: 12px; color: var(--dim); }
	.rec b { color: var(--bright); }
	.caveat { margin: 7px 0 0; font-size: 12px; line-height: 1.5; color: var(--faint); }

	/* The wide web is a breakpoint, not a project (plans/surfaces.md §8.5). */
	@media (min-width: 900px) {
		.tabs { display: none; }
		.columns {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr)) 320px;
			gap: 12px;
			align-items: start;
		}
		.lane.hidden-on-phone { display: block; }
		.lane {
			background: rgba(11, 18, 32, 0.5);
			border: 1px solid var(--rule); border-radius: 12px; padding: 12px;
			max-height: calc(100vh - 190px); overflow: auto;
		}
		.lane h2 {
			display: flex; align-items: center; justify-content: space-between;
			margin: 0 0 10px; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
			color: var(--cyan); font-weight: 700;
		}
		.detail {
			position: sticky; top: 12px; inset: auto; transform: none; max-height: none;
			border: 1px solid var(--rule); border-radius: 12px; background: rgba(11,18,32,.5);
		}
	}
</style>
