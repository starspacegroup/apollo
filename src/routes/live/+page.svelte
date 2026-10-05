<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { PHASES, type LiveRun } from '$lib/board';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const board = $derived(data.board);
	const live = $derived(board?.live ?? null);

	// The snapshot is pushed once a minute; reading it every fifteen seconds
	// keeps the page within a quarter of that. The clock ticks every second so
	// elapsed times and "ago" move between reads.
	let now = $state(Date.now());
	let focus: string | null = $state(null);
	onMount(() => {
		const tick = setInterval(() => (now = Date.now()), 1000);
		const read = setInterval(() => invalidateAll(), 15000);
		return () => {
			clearInterval(tick);
			clearInterval(read);
		};
	});

	const TONES = ['#59d9ff', '#7ad7a0', '#ffb14e', '#ff6a4d', '#a78bfa'];
	function tone(name: string): string {
		let h = 0;
		for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
		return TONES[h % TONES.length];
	}
	function kindTone(kind: string, failed: boolean): string {
		if (failed) return '#ff6a4d';
		if (kind === 'edit' || kind === 'web') return '#59d9ff';
		if (kind === 'bash' || kind === 'test') return '#ffb14e';
		if (kind === 'commit' || kind === 'push') return '#7ad7a0';
		if (kind === 'say' || kind === 'skill') return '#a78bfa';
		return '#8fa3bd';
	}
	function mmss(secs: number): string {
		const s = Math.max(0, Math.floor(secs));
		if (s >= 3600)
			return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
		return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
	}
	function ago(at: string): string {
		const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
		if (s < 5) return 'just now';
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		return `${Math.floor(s / 3600)}h ago`;
	}
	function tokens(n: number): string {
		if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
		if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
		return String(n);
	}
	const ofProject = (place: string, p: string) =>
		place.toLowerCase() === p.toLowerCase() ||
		place.split('#')[0].toLowerCase() === p.toLowerCase();

	const projects = $derived.by(() => {
		const m = new Map<string, LiveRun[]>();
		for (const w of live?.working ?? []) m.set(w.project, [...(m.get(w.project) ?? []), w]);
		return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
	});
	const runs = $derived((live?.working ?? []).filter((w) => !focus || w.project === focus));
	const feed = $derived(
		(live?.feed ?? []).filter((e) => !focus || ofProject(e.project, focus)).slice(0, 18)
	);
	const lanes = $derived(
		(live?.lanes ?? [])
			.map((l) => ({ ...l, segments: l.segments.filter((s) => !focus || s.project === focus) }))
			.filter((l) => l.segments.length > 0)
	);
	const sentence = $derived.by(() => {
		const n = runs.length;
		if (focus)
			return n === 0
				? `Nobody is working on ${focus} right now.`
				: n === 1
					? 'One is working.'
					: `${n} are working.`;
		if (n === 0) return 'Nobody is working right now. The last hour is below.';
		if (n === 1) return `One teammate is working, on ${runs[0].project}.`;
		return `${n} teammates are working across ${projects.length} projects right now.`;
	});
	const SPAN = 3600 * 1000;
	const pos = (at: string) =>
		Math.min(100, Math.max(0, ((SPAN - (now - Date.parse(at))) / SPAN) * 100));
	const five = $derived(board?.meters?.five_hour ?? 0);
</script>

<svelte:head><title>Apollo · Live</title></svelte:head>

<main class="live">
	<header class="head">
		<a class="brand" href="/live">Apollo</a>
		<span class="badge"><span class="dot"></span>LIVE</span>
		<nav class="links"><a href="/board">Board</a> <a href="/chat">Chat</a></nav>
		<span class="clock">{new Date(now).toLocaleTimeString([], { hour12: false })}</span>
	</header>

	{#if !board || !live}
		<p class="wait">
			{data.error ??
				(board
					? 'This snapshot carries no live data yet — the local half pushes it once a minute.'
					: 'Reading the board…')}
		</p>
	{:else}
		{#if focus}<button class="back" onclick={() => (focus = null)}>← Every project</button>{/if}
		<h1>{focus ? `${focus}, live` : 'What the team is doing'}</h1>
		<p class="sentence">{sentence}</p>
		<nav class="chips">
			<button class:on={!focus} onclick={() => (focus = null)}>All projects</button>
			{#each projects as [p, ws] (p)}
				<button class:on={focus === p} onclick={() => (focus = p)}>{p} · {ws.length}</button>
			{/each}
		</nav>

		{#if !focus}
			<section class="stats">
				<div class="stat"><span class="k">Working now</span><b>{live.working.length}</b></div>
				<div class="stat">
					<span class="k">Actions this minute</span>
					<div class="row">
						<b>{live.per_minute}</b>
						{#if live.per_minute > 0}<span class="eq"
								>{#each [0, 1, 2, 3, 4, 5] as i}<i style="animation-delay:-{i * 0.17}s"
									></i>{/each}</span
							>{/if}
					</div>
				</div>
				<div class="stat">
					<span class="k">Tokens this hour</span><b>{tokens(live.tokens_hour)}</b>
					<span class="s">5-hour window at {five.toFixed(0)}%</span>
					<span class="meter"><i style="width:{Math.min(100, five)}%"></i></span>
				</div>
			</section>
		{/if}

		<div class="grid">
			<section class="floor">
				<h2>The floor — who is where</h2>
				{#if runs.length === 0}<p class="empty">
						A card appears here for each run while it works.
					</p>{/if}
				{#each runs as w (w.id)}
					{@const quiet = w.quiet_seconds + (now - Date.parse(board.generated_at)) / 1000}
					{@const ringing = quiet < 60}
					<article class="run">
						<div class="run-head">
							<span class="face" class:ring={ringing} style="background:{tone(w.name)}"
								>{w.name.charAt(0)}</span
							>
							<div class="who">
								<div><b>{w.name}</b> <span class="faint">{w.role} · {w.project}</span></div>
								<div class="brief">{w.brief}</div>
							</div>
							<div class="clock2">
								<b>{mmss((now - Date.parse(w.started_at)) / 1000)}</b>
								<span class="faint">{w.model ?? '—'} · {tokens(w.tokens)} tokens</span>
							</div>
						</div>
						{#if w.writes}
							<div class="phases">
								{#each PHASES as label, i}
									<span class="phase" class:now={i === w.phase} class:done={i < w.phase}
										>{label}</span
									>
								{/each}
							</div>
						{/if}
						<div class="cols">
							<div>
								<h3>What it is doing</h3>
								{#each w.steps as s, i}
									<div class="step" style="opacity:{Math.max(0.35, 1 - i * 0.12)}">
										<span class="kind" style="color:{kindTone(s.kind, s.failed)}"
											>{s.failed ? 'failed' : s.kind}</span
										>
										<span class="what">{s.what}</span>
										{#if i === 0 && ringing}<span class="caret"></span>{/if}
									</div>
								{/each}
							</div>
							<div>
								<h3>Files it has touched</h3>
								{#if w.files.length === 0}<p class="empty">none yet</p>{/if}
								{#each w.files as [f, n]}
									<div class="file">
										<span>{f}</span><span class="heat"
											><i style="width:{(n / (w.files[0]?.[1] || 1)) * 100}%"></i></span
										>
									</div>
								{/each}
							</div>
						</div>
						<p class="foot faint">
							{w.branch ? `On ${w.branch}` : 'Reads and reports; no branch'}{quiet >= 120
								? ` · quiet for ${mmss(quiet)}`
								: ''}
						</p>
					</article>
				{/each}
			</section>

			<section class="feed">
				<h2>{focus ? `# ${focus}, as it happens` : 'As it happens'}</h2>
				{#if feed.length === 0}<p class="empty">nothing in the last hour</p>{/if}
				{#each feed as e, i (e.at + e.who + i)}
					<div class="ev" class:fresh={i === 0} style="opacity:{Math.max(0.45, 1 - i * 0.04)}">
						<span class="dotface" style="background:{tone(e.who)}">{e.who.charAt(0)}</span>
						<div>
							<b>{e.who}</b>
							{e.what}
							<div class="faint">{e.project} · {ago(e.at)}</div>
						</div>
					</div>
				{/each}
			</section>
		</div>

		<section class="lanes">
			<h2>
				{focus ? `The last hour on ${focus}` : 'The last hour'}
				<span class="faint">each bar is one job · the bright one is still going</span>
			</h2>
			{#if lanes.length === 0}<p class="empty">no jobs in the last hour</p>{/if}
			{#each lanes as l (l.who)}
				<div class="lane">
					<span class="lname"><span style="color:{tone(l.who)}">●</span> {l.who}</span>
					<div class="track">
						{#each l.segments as s}
							{@const left = pos(s.start)}
							{@const right = s.end ? pos(s.end) : 100}
							<span
								class="seg"
								class:going={!s.end}
								title="{s.project} — {s.label}{s.outcome ? ` (${s.outcome})` : ''}"
								style="left:{left}%;width:{Math.max(0.6, right - left)}%;background:{tone(
									l.who
								)};color:{tone(l.who)}"
							></span>
						{/each}
					</div>
				</div>
			{/each}
			<div class="axis">
				<span>an hour ago</span><span>45m</span><span>30m</span><span>15m</span><span>now</span>
			</div>
		</section>
		<p class="stamp faint">Snapshot from {board.machine}, {ago(board.generated_at)}.</p>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		background: #05070d;
		color: #dbe6f5;
	}
	.live {
		--cyan: #59d9ff;
		--amber: #ffb14e;
		--green: #7ad7a0;
		--red: #ff6a4d;
		--violet: #a78bfa;
		--dim: #8fa3bd;
		--faint: #64748b;
		--rule: rgba(219, 230, 245, 0.1);
		--rule2: rgba(219, 230, 245, 0.18);
		font-family: Inter, system-ui, sans-serif;
		max-width: 1400px;
		margin: 0 auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-sizing: border-box;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.brand {
		color: #f2f7ff;
		font-weight: 700;
		font-size: 1.2rem;
		text-decoration: none;
	}
	.badge {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		color: var(--red);
		border: 1px solid rgba(255, 106, 77, 0.4);
		border-radius: 999px;
		padding: 2px 9px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.14em;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--red);
		animation: pulse 1.4s ease-in-out infinite;
	}
	.links a {
		color: var(--cyan);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.clock {
		margin-left: auto;
		font-family: ui-monospace, monospace;
		color: var(--dim);
	}
	h1 {
		margin: 0;
		font-size: 1.6rem;
		color: #f2f7ff;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim);
		font-weight: 600;
	}
	h3 {
		margin: 0 0 6px;
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim);
		font-weight: 600;
	}
	.sentence {
		margin: 0;
		font-size: 1.1rem;
	}
	.wait,
	.empty {
		color: var(--dim);
		margin: 0;
		font-size: 0.9rem;
	}
	.faint {
		color: var(--faint);
		font-size: 0.8rem;
	}
	.back {
		align-self: flex-start;
		background: none;
		border: 0;
		color: var(--cyan);
		cursor: pointer;
		padding: 0;
		font: inherit;
	}
	.chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.chips button {
		font: inherit;
		font-size: 0.85rem;
		padding: 6px 12px;
		min-height: 36px;
		border-radius: 999px;
		border: 1px solid var(--rule2);
		background: transparent;
		color: var(--dim);
		cursor: pointer;
	}
	.chips button.on {
		background: rgba(89, 217, 255, 0.12);
		border-color: rgba(89, 217, 255, 0.5);
		color: #f2f7ff;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}
	.stat,
	.floor,
	.feed,
	.lanes {
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: rgba(11, 18, 32, 0.6);
		padding: 12px 14px;
		min-width: 0;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.stat .k {
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.stat b {
		font-size: 1.8rem;
		color: #f2f7ff;
		font-variant-numeric: tabular-nums;
	}
	.stat .s {
		color: var(--dim);
		font-size: 0.75rem;
	}
	.row {
		display: flex;
		align-items: flex-end;
		gap: 10px;
	}
	.eq {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 22px;
		margin-bottom: 6px;
	}
	.eq i {
		display: block;
		width: 4px;
		height: 100%;
		border-radius: 2px;
		background: var(--cyan);
		transform-origin: bottom;
		animation: eq 1.1s ease-in-out infinite;
	}
	.meter {
		height: 4px;
		border-radius: 2px;
		background: rgba(219, 230, 245, 0.1);
		overflow: hidden;
	}
	.meter i {
		display: block;
		height: 100%;
		background: var(--green);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(260px, 380px);
		gap: 12px;
		align-items: start;
	}
	@media (max-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.floor {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.run {
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: rgba(5, 7, 13, 0.5);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.run-head {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}
	.face {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #05070d;
		font-weight: 700;
		flex: none;
	}
	.face.ring {
		animation: ring 2.2s ease-out infinite;
	}
	.who {
		flex: 1;
		min-width: 180px;
	}
	.who b {
		color: #f2f7ff;
	}
	.brief {
		font-size: 0.9rem;
		margin-top: 2px;
	}
	.clock2 {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}
	.clock2 b {
		font-family: ui-monospace, monospace;
		font-size: 1.2rem;
		color: #f2f7ff;
	}
	.phases {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.phase {
		font-size: 0.75rem;
		padding: 3px 10px;
		border-radius: 999px;
		border: 1px solid var(--rule2);
		color: var(--faint);
	}
	.phase.done {
		color: var(--green);
		border-color: rgba(122, 215, 160, 0.4);
		background: rgba(122, 215, 160, 0.1);
	}
	.phase.now {
		color: var(--cyan);
		border-color: var(--cyan);
		background: rgba(89, 217, 255, 0.16);
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 12px;
	}
	@media (max-width: 700px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.step {
		display: flex;
		gap: 10px;
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		padding: 2px 0;
	}
	.kind {
		flex: 0 0 52px;
	}
	.what {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.caret {
		display: inline-block;
		width: 7px;
		height: 14px;
		background: var(--cyan);
		animation: blink 1s steps(1) infinite;
	}
	.file {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		padding: 2px 0;
		overflow-wrap: anywhere;
	}
	.heat {
		height: 3px;
		border-radius: 2px;
		background: rgba(219, 230, 245, 0.08);
		overflow: hidden;
	}
	.heat i {
		display: block;
		height: 100%;
		background: var(--cyan);
	}
	.foot {
		margin: 0;
	}
	.ev {
		display: flex;
		gap: 10px;
		padding: 6px 0;
		font-size: 0.88rem;
		overflow-wrap: anywhere;
	}
	.ev b {
		color: #f2f7ff;
	}
	.ev.fresh {
		animation: rise 0.5s ease-out;
	}
	.dotface {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #05070d;
		font-weight: 700;
		font-size: 0.75rem;
		flex: none;
	}
	.lane {
		display: grid;
		grid-template-columns: 140px minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		padding: 4px 0;
	}
	.lname {
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track {
		position: relative;
		height: 18px;
		border-radius: 4px;
		background: rgba(219, 230, 245, 0.04);
	}
	.seg {
		position: absolute;
		top: 3px;
		bottom: 3px;
		border-radius: 3px;
		opacity: 0.45;
	}
	.seg.going {
		opacity: 1;
		box-shadow: 0 0 10px currentColor;
	}
	.axis {
		display: flex;
		justify-content: space-between;
		margin-left: 150px;
		font-size: 0.75rem;
		color: var(--faint);
	}
	@media (max-width: 600px) {
		.lane {
			grid-template-columns: 90px minmax(0, 1fr);
		}
		.axis {
			margin-left: 100px;
		}
	}
	.stamp {
		margin: 0;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}
	@keyframes eq {
		0%,
		100% {
			transform: scaleY(0.25);
		}
		50% {
			transform: scaleY(1);
		}
	}
	@keyframes ring {
		0% {
			box-shadow: 0 0 0 0 rgba(89, 217, 255, 0.55);
		}
		70% {
			box-shadow: 0 0 0 9px rgba(89, 217, 255, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(89, 217, 255, 0);
		}
	}
	@keyframes blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0;
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dot,
		.eq i,
		.face.ring,
		.caret,
		.ev.fresh {
			animation: none;
		}
	}
</style>
