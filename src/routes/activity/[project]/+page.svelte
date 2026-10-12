<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		brandOf,
		shortModel,
		type AskedFor,
		type Board,
		type Line,
		type LiveRun,
		type Member,
		type RoomView
	} from '$lib/board';
	import { avatarOf, openLink, participants, type Participant } from '$lib/activity';
	import type { PageData } from './$types';

	/**
	 * One project, inside Discord (David, 2026-10-12: *"the activity should
	 * show them an interface of the agents with interactivity to the max"*).
	 *
	 * The team on the left, the room in the middle, what waits on the right.
	 * Everything a button does here goes out as an intent on the same wire the
	 * hosted board uses: a request the machine applies under the dial and the
	 * gate, never a command. The page polls the snapshot every few seconds;
	 * the daemon pushes within ten of a new line, so a conversation here is a
	 * conversation.
	 */
	let { data }: { data: PageData } = $props();

	let board = $state<Board | null>(null);
	let error = $state<string | null>(null);
	let now = $state(Date.now());
	let roomName = $state<string>(data.room ?? data.project);
	let here = $state<Participant[]>([]);
	let asked = $state<AskedFor[]>([]);
	let busy = $state(false);
	let note = $state<string | null>(null);
	let draft = $state('');
	let editing = $state<{ id: number; brief: string } | null>(null);
	let requesting = $state(false);
	let reqCharacter = $state('');
	let reqNote = $state('');
	let pending = $state<Line[]>([]);
	let feedEl = $state<HTMLDivElement | undefined>();
	let stuck = $state(true);

	const project = $derived(data.project);
	const proj = $derived(board?.projects.find((p) => p.name === project) ?? null);
	const brand = $derived(brandOf(proj));
	const rooms = $derived((board?.rooms ?? []).filter((r) => r.project === project));
	const room: RoomView | null = $derived(
		rooms.find((r) => r.room === roomName) ??
			rooms.find((r) => r.room === project) ??
			rooms[0] ??
			null
	);
	const general = $derived(rooms.find((r) => r.room === project) ?? room);
	const level = $derived(board?.viewer?.projects[project] ?? 'none');
	const manager = $derived(
		board?.viewer?.role === 'owner' || board?.viewer?.role === 'admin' || level === 'manager'
	);
	const member = $derived(manager || level === 'member');
	const working: LiveRun[] = $derived(
		(board?.live?.working ?? []).filter((w) => w.project.toLowerCase() === project.toLowerCase())
	);
	const feed = $derived(
		(board?.live?.feed ?? [])
			.filter((e) => e.project.split('#')[0].toLowerCase() === project.toLowerCase())
			.slice(0, 12)
	);
	const rule = $derived(board?.switches?.projects.find((p) => p.name === project) ?? null);
	const attention = $derived(
		(board?.attention ?? []).filter(
			(a) => (a.subject ?? '').toLowerCase() === project.toLowerCase()
		)
	);
	const lines: Line[] = $derived([...(room?.lines ?? []), ...pending]);
	const dialOrder = ['off', 'propose', 'supervised', 'autonomous'] as const;
	const autonomy = $derived(
		(rule?.autonomy as Board['autonomy'] | null) ?? board?.autonomy ?? 'off'
	);
	const lowerTo = $derived(dialOrder.slice(0, Math.max(0, dialOrder.indexOf(autonomy))).reverse());

	function runOf(m: Member): LiveRun | undefined {
		return working.find((w) => w.handle.toLowerCase() === m.handle.toLowerCase());
	}

	async function read() {
		try {
			const r = await fetch('/api/board');
			if (r.status === 401 || r.status === 403) {
				error = 'Your sign-in lapsed. Close and reopen the activity.';
				return;
			}
			if (!r.ok) {
				error = `the board answered ${r.status}`;
				return;
			}
			const b = (await r.json()) as Board;
			// A line we sent is pending until the snapshot carries it.
			const ids = new Set((b.rooms ?? []).flatMap((x) => x.lines.map((l) => l.text + '|' + l.who)));
			pending = pending.filter(
				(p) => !ids.has(p.text + '|' + p.who) && Date.now() - Date.parse(p.at) < 120000
			);
			board = b;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function readAsked() {
		try {
			const r = await fetch('/api/intents');
			if (r.ok) asked = ((await r.json()) as { intents: AskedFor[] }).intents ?? [];
		} catch {
			/* offline is a state */
		}
	}

	async function ask(kind: string, payload: Record<string, unknown>): Promise<boolean> {
		busy = true;
		note = null;
		try {
			const r = await fetch('/api/intents', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind, payload: { project, ...payload } })
			});
			const body = (await r.json()) as { error?: string; intent?: AskedFor };
			if (!r.ok || body.error) {
				note = body.error ?? `refused (${r.status})`;
				return false;
			}
			if (body.intent) asked = [body.intent, ...asked];
			return true;
		} catch (e) {
			note = e instanceof Error ? e.message : String(e);
			return false;
		} finally {
			busy = false;
		}
	}

	async function say() {
		const text = draft.trim();
		if (!text || !room) return;
		const me = board?.viewer;
		const mine: Line = {
			id: -Date.now(),
			at: new Date().toISOString(),
			who: me?.name ?? 'you',
			name: me?.name ?? 'you',
			tag: null,
			kind: 'said',
			provenance: me?.role === 'owner' ? 'david' : 'outside',
			text,
			reference: null,
			files: []
		};
		draft = '';
		pending = [...pending, mine];
		stuck = true;
		if (!(await ask('room.say', { room: room.room, text }))) {
			pending = pending.filter((p) => p !== mine);
			draft = text;
		}
	}

	function mention(m: Member) {
		draft = draft ? `${draft.trimEnd()} @${m.name} ` : `@${m.name} `;
		document.getElementById('say')?.focus();
	}

	async function approve(id: number, brief?: string) {
		if (await ask('proposal.approve', { id, ...(brief ? { brief } : {}) })) editing = null;
	}
	async function reject(id: number) {
		await ask('proposal.reject', { id });
	}
	async function stop(id: string) {
		await ask('run.stop', { id });
	}
	async function request() {
		if (!reqCharacter) return;
		if (await ask('work.request', { character: reqCharacter, note: reqNote.trim() || undefined })) {
			requesting = false;
			reqNote = '';
		}
	}

	function when(at: string): string {
		const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
		if (s < 5) return 'now';
		if (s < 60) return `${s}s`;
		if (s < 3600) return `${Math.floor(s / 60)}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		return `${Math.floor(s / 86400)}d`;
	}
	function clock(at: string): string {
		return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
	function mmss(secs: number): string {
		const s = Math.max(0, Math.floor(secs));
		return s >= 3600
			? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
			: `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
	}
	function linkOf(ref: string | null): string | null {
		if (!ref) return null;
		if (/^https?:\/\//.test(ref)) return ref;
		const m = ref.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
		if (m) return `https://github.com/${m[1]}/pull/${m[2]}`;
		return null;
	}
	function stateOf(i: AskedFor): string {
		return i.state === 'applied'
			? (i.detail ?? 'done')
			: i.state === 'refused'
				? `refused: ${i.detail ?? ''}`
				: i.state;
	}
	function onScroll() {
		if (!feedEl) return;
		stuck = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 40;
	}
	$effect(() => {
		void lines.length;
		if (stuck && feedEl) tick().then(() => feedEl && (feedEl.scrollTop = feedEl.scrollHeight));
	});

	onMount(() => {
		read();
		readAsked();
		participants().then((p) => (here = p));
		const t = setInterval(() => (now = Date.now()), 1000);
		const r = setInterval(read, 5000);
		const a = setInterval(readAsked, 10000);
		const h = setInterval(() => participants().then((p) => (here = p)), 20000);
		return () => {
			clearInterval(t);
			clearInterval(r);
			clearInterval(a);
			clearInterval(h);
		};
	});
</script>

<svelte:head>
	<title>{project} · Apollo</title>
</svelte:head>

<div class="app" style:--c={brand.color ?? '#59d9ff'}>
	<header>
		<button
			class="ghost"
			onclick={() => goto('/activity?frame_id=kept')}
			title="Every project"
			aria-label="Back">‹</button
		>
		{#if brand.logo}<img class="mark" src={brand.logo} alt="" />{/if}
		<h1>{project}</h1>
		{#if rooms.length > 1}
			<nav class="rooms">
				{#each rooms as r (r.room)}
					<button class:on={room?.room === r.room} onclick={() => (roomName = r.room)}>
						#{r.room === project ? 'general' : r.room.split('#')[1]}
					</button>
				{/each}
			</nav>
		{/if}
		<span class="grow"></span>
		{#if board}
			<span class="pill" class:paused={rule?.focus === 'paused'} title="What may start by itself">
				{rule?.focus === 'paused' ? 'paused' : autonomy}
			</span>
			{#if board.paused_until && Date.parse(board.paused_until) > now}
				<span class="pill paused">fleet paused</span>
			{/if}
			<span class="pill" class:bad={!board.gate_ok} title={board.gate_detail}>
				{board.gate_ok ? 'gate ✓' : 'no gate'}
			</span>
		{/if}
		{#if here.length}
			<span class="here" title={here.map((p) => p.global_name || p.username).join(', ')}>
				{#each here.slice(0, 6) as p (p.id)}
					{#if avatarOf(p)}<img src={avatarOf(p)} alt={p.username} />{:else}<i
							>{(p.global_name || p.username).slice(0, 1)}</i
						>{/if}
				{/each}
				{#if here.length > 6}<b>+{here.length - 6}</b>{/if}
			</span>
		{/if}
	</header>

	{#if error}
		<p class="bad center">{error}</p>
	{:else if !board}
		<p class="dim center">Reading the board…</p>
	{:else if !room}
		<p class="dim center">No room for {project} has reached here yet.</p>
	{:else}
		<div class="cols">
			<!-- ── the team ───────────────────────────────────────────── -->
			<aside class="team">
				<h2>Team <small>{room.team.length}</small></h2>
				<ul>
					{#each room.team as m (m.handle)}
						{@const run = runOf(m)}
						<li class:working={!!run}>
							<button class="face" onclick={() => mention(m)} title={`@${m.name} — ${m.purpose}`}>
								{#if m.face}<img src={`/api/face/${m.face}`} alt="" loading="lazy" />{:else}<i
										>{m.name.slice(0, 1)}</i
									>{/if}
								{#if run}<span class="dot"></span>{/if}
							</button>
							<div class="who">
								<b>{m.name}</b>
								<span class="tag">{m.tag}</span>
								{#if run}
									<p class="doing" title={run.doing}>{run.doing || 'working'}</p>
									<p class="meta">
										{shortModel(run.model)} · {mmss((now - Date.parse(run.started_at)) / 1000)} · {run.tokens.toLocaleString()}
										tok
									</p>
								{:else}
									<p class="meta purpose">{m.purpose}</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
				{#if member}
					<div class="box">
						{#if requesting}
							<label
								>Who<select bind:value={reqCharacter}>
									<option value="">—</option>
									{#each room.team.filter((m) => m.handle !== 'amy' && m.handle !== 'dirac') as m (m.handle)}
										<option value={m.handle}>{m.name} · {m.tag}</option>
									{/each}
								</select></label
							>
							<textarea bind:value={reqNote} rows="3" placeholder="What for, in a sentence"
							></textarea>
							<div class="row">
								<button class="go" disabled={busy || !reqCharacter} onclick={request}
									>Ask for work</button
								>
								<button class="ghost" onclick={() => (requesting = false)}>Cancel</button>
							</div>
						{:else}
							<button class="go wide" onclick={() => (requesting = true)}
								>Ask someone for work</button
							>
						{/if}
					</div>
				{/if}
			</aside>

			<!-- ── the room ───────────────────────────────────────────── -->
			<section class="room">
				<div class="lines" bind:this={feedEl} onscroll={onScroll}>
					{#each lines as l (l.id)}
						{@const href = linkOf(l.reference)}
						{#if l.kind === 'said'}
							<article class={`line ${l.provenance}`} class:pending={l.id < 0}>
								<header>
									<b>{l.name}</b>
									{#if l.tag}<span class="tag">{l.tag}</span>{/if}
									<time title={new Date(l.at).toLocaleString()}>{clock(l.at)}</time>
									{#if l.id < 0}<em class="dim">sending…</em>{/if}
								</header>
								<p>{l.text}</p>
								{#if l.files.length}
									<p class="files">
										{#each l.files as f (f.id)}<span>📎 {f.name}</span>{/each}
									</p>
								{/if}
								{#if href}<button class="link" onclick={() => openLink(href)}>{l.reference}</button
									>{/if}
							</article>
						{:else}
							<p class="step">
								<time>{clock(l.at)}</time>
								<i>{l.kind}</i>
								{l.text}
								{#if href}<button class="link" onclick={() => openLink(href)}>↗</button>{/if}
							</p>
						{/if}
					{:else}
						<p class="dim center">Nothing has been said here yet.</p>
					{/each}
				</div>
				{#if !stuck}
					<button
						class="jump"
						onclick={() => {
							stuck = true;
							if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
						}}>↓ newest</button
					>
				{/if}
				{#if member}
					<form
						class="say"
						onsubmit={(e) => {
							e.preventDefault();
							say();
						}}
					>
						<textarea
							id="say"
							bind:value={draft}
							rows="2"
							placeholder={`Say something in #${room.room === project ? 'general' : room.room.split('#')[1]} — @name to address someone`}
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									say();
								}
							}}
						></textarea>
						<button class="go" type="submit" disabled={busy || !draft.trim()}>Say</button>
					</form>
				{:else}
					<p class="dim center small">
						You can read this room. Ask David for a seat to speak in it.
					</p>
				{/if}
				{#if note}<p class="bad small">{note}</p>{/if}
			</section>

			<!-- ── what waits ─────────────────────────────────────────── -->
			<aside class="side">
				{#if general?.proposals.length}
					<h2>Proposals <small>{general.proposals.length}</small></h2>
					{#each general.proposals as p (p.id)}
						<article class="card prop">
							<header><b>{p.name}</b> <span class="dim">#{p.id} · {when(p.at)}</span></header>
							{#if editing?.id === p.id}
								<textarea bind:value={editing.brief} rows="4"></textarea>
								<div class="row">
									<button class="go" disabled={busy} onclick={() => approve(p.id, editing?.brief)}
										>Approve as edited</button
									>
									<button class="ghost" onclick={() => (editing = null)}>Cancel</button>
								</div>
							{:else}
								<p>{p.note}</p>
								{#if manager}
									<div class="row">
										<button class="go" disabled={busy} onclick={() => approve(p.id)}>Approve</button
										>
										<button class="ghost" onclick={() => (editing = { id: p.id, brief: p.note })}
											>Edit</button
										>
										<button class="no" disabled={busy} onclick={() => reject(p.id)}>Reject</button>
									</div>
								{/if}
							{/if}
						</article>
					{/each}
				{/if}

				<h2>Runs <small>{working.length} in flight</small></h2>
				{#each working as w (w.id)}
					<article class="card run">
						<header>
							<b>{w.name}</b> <span class="tag">{w.role}</span>
							<span class="dim">{mmss((now - Date.parse(w.started_at)) / 1000)}</span>
						</header>
						<p class="doing">{w.doing || w.brief}</p>
						<div class="phase">
							{#each ['brief', 'code', 'edit', 'test', 'commit', 'push'] as ph, i (ph)}
								<span class:done={i < w.phase} class:now={i === w.phase} title={ph}></span>
							{/each}
						</div>
						{#if w.steps.length}
							<ul class="steps">
								{#each w.steps.slice(-4) as s, i (i)}
									<li class:failed={s.failed}><i>{s.kind}</i> {s.what}</li>
								{/each}
							</ul>
						{/if}
						<div class="row">
							{#if w.branch}<button
									class="link"
									onclick={() =>
										proj?.remote && openLink(`https://github.com/${proj.remote}/tree/${w.branch}`)}
									>{w.branch}</button
								>{/if}
							{#if manager}<button class="no small" disabled={busy} onclick={() => stop(w.id)}
									>Stop</button
								>{/if}
						</div>
					</article>
				{/each}
				{#each (general?.runs ?? []).filter((r) => r.state !== 'running').slice(0, 5) as r (r.id)}
					<article class="card ended">
						<header>
							<b>{r.name}</b> <span class={`st ${r.state}`}>{r.state}</span>
							<span class="dim">{r.ended_at ? when(r.ended_at) : ''}</span>
						</header>
						<p class="dim">{r.prompt}</p>
					</article>
				{/each}

				{#if attention.length}
					<h2>Needs you <small>{attention.length}</small></h2>
					{#each attention as a (a.id)}
						<article class="card att">
							<header><b>{a.kind}</b> <span class="dim">{when(a.at)}</span></header>
							<p>{a.detail}</p>
							{#if manager}<button
									class="ghost small"
									disabled={busy}
									onclick={() => ask('attention.resolve', { id: a.id })}>Seen</button
								>{/if}
						</article>
					{/each}
				{/if}

				{#if feed.length}
					<h2>Lately</h2>
					<ul class="feed">
						{#each feed as e, i (i)}
							<li><time>{when(e.at)}</time> <b>{e.who}</b> {e.what}</li>
						{/each}
					</ul>
				{/if}

				{#if manager}
					<h2>Controls</h2>
					<div class="controls">
						{#if rule?.focus !== 'paused'}
							<button class="no" disabled={busy} onclick={() => ask('project.pause', {})}
								>Pause {project}</button
							>
						{:else}
							<p class="dim small">Paused. Un-pausing is done at the machine.</p>
						{/if}
						{#each lowerTo as lv (lv)}
							<button
								class="ghost"
								disabled={busy}
								onclick={() => ask('autonomy.lower', { level: lv })}>Cap at {lv}</button
							>
						{/each}
						{#if rule?.off.length}<p class="dim small">Off here: {rule.off.join(', ')}</p>{/if}
					</div>
				{/if}

				{#if asked.length}
					<h2>Asked</h2>
					<ul class="asked">
						{#each asked.slice(0, 6) as i (i.id)}
							<li class={i.state}><b>{i.kind}</b> <span>{stateOf(i)}</span></li>
						{/each}
					</ul>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		background: #05070d;
	}
	.app {
		min-height: 100vh;
		color: #dbe6f5;
		font:
			14px/1.4 system-ui,
			sans-serif;
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #131a27;
		background: #080b13;
		position: sticky;
		top: 0;
		z-index: 2;
	}
	h1 {
		font-size: 1.05rem;
		margin: 0;
		font-weight: 600;
	}
	.mark {
		width: 22px;
		height: 22px;
		object-fit: contain;
	}
	.grow {
		flex: 1;
	}
	.rooms {
		display: flex;
		gap: 0.25rem;
		margin-left: 0.5rem;
	}
	.rooms button {
		background: none;
		border: 1px solid #1d2636;
		color: #8fa3bd;
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.rooms button.on {
		color: #dbe6f5;
		border-color: var(--c);
	}
	.pill {
		font-size: 0.75rem;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		border: 1px solid #1d2636;
		color: #8fa3bd;
	}
	.pill.paused {
		color: #ffb14e;
		border-color: #ffb14e55;
	}
	.pill.bad {
		color: #ff6a4d;
	}
	.here {
		display: flex;
		align-items: center;
	}
	.here img,
	.here i {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		margin-left: -6px;
		border: 2px solid #080b13;
		background: #1d2636;
		font-style: normal;
		font-size: 0.7rem;
		display: grid;
		place-items: center;
	}
	.here b {
		font-size: 0.7rem;
		margin-left: 0.25rem;
		color: #8fa3bd;
	}
	.cols {
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr) 18rem;
		gap: 0;
		flex: 1;
		min-height: 0;
	}
	aside,
	.room {
		min-height: 0;
	}
	.team,
	.side {
		padding: 0.75rem;
		overflow-y: auto;
		max-height: calc(100vh - 3rem);
	}
	.team {
		border-right: 1px solid #131a27;
	}
	.side {
		border-left: 1px solid #131a27;
	}
	h2 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #8fa3bd;
		margin: 0.5rem 0 0.5rem;
	}
	h2 small {
		font-weight: 400;
		margin-left: 0.3rem;
	}
	.team ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.team li {
		display: flex;
		gap: 0.5rem;
		padding: 0.35rem 0;
		align-items: flex-start;
	}
	.face {
		position: relative;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 2px solid #1d2636;
		background: #0b0f18;
		padding: 0;
		cursor: pointer;
		overflow: hidden;
		flex: none;
	}
	.working .face {
		border-color: #7ad7a0;
	}
	.face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.face i {
		font-style: normal;
		display: grid;
		place-items: center;
		height: 100%;
	}
	.dot {
		position: absolute;
		right: 2px;
		bottom: 2px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #7ad7a0;
		box-shadow: 0 0 0 2px #05070d;
	}
	.who {
		min-width: 0;
	}
	.who b {
		font-size: 0.85rem;
	}
	.tag {
		font-size: 0.7rem;
		color: var(--c);
		margin-left: 0.3rem;
	}
	.meta,
	.doing {
		margin: 0.1rem 0 0;
		font-size: 0.75rem;
		color: #8fa3bd;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.doing {
		color: #dbe6f5;
	}
	.purpose {
		white-space: normal;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.box {
		margin-top: 0.75rem;
		display: grid;
		gap: 0.4rem;
	}
	label {
		font-size: 0.75rem;
		color: #8fa3bd;
		display: grid;
		gap: 0.2rem;
	}
	select,
	textarea {
		background: #0b0f18;
		color: #dbe6f5;
		border: 1px solid #1d2636;
		border-radius: 6px;
		padding: 0.4rem 0.5rem;
		font: inherit;
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
	}
	textarea:focus,
	select:focus {
		outline: none;
		border-color: var(--c);
	}
	.row {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		align-items: center;
	}
	button.go,
	button.no,
	button.ghost {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.35rem 0.7rem;
		border-radius: 6px;
		cursor: pointer;
		border: 1px solid transparent;
	}
	button.go {
		background: var(--c);
		color: #05070d;
		font-weight: 600;
	}
	button.no {
		background: #2a1410;
		color: #ff6a4d;
		border-color: #ff6a4d44;
	}
	button.ghost {
		background: none;
		color: #8fa3bd;
		border-color: #1d2636;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.wide {
		width: 100%;
	}
	.small {
		font-size: 0.75rem;
	}
	.room {
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 3rem);
		position: relative;
	}
	.lines {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.line header {
		position: static;
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		padding: 0;
		border: 0;
		background: none;
	}
	.line b {
		font-size: 0.85rem;
	}
	.line.david b {
		color: #ffb14e;
	}
	.line.agent b {
		color: var(--c);
	}
	.line.outside b {
		color: #a78bfa;
	}
	.line time,
	.step time {
		font-size: 0.7rem;
		color: #5c6b82;
	}
	.line p {
		margin: 0.1rem 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.line.pending {
		opacity: 0.6;
	}
	.files span {
		font-size: 0.75rem;
		color: #8fa3bd;
		margin-right: 0.5rem;
	}
	.step {
		margin: 0;
		font-size: 0.78rem;
		color: #8fa3bd;
	}
	.step i {
		color: #5c6b82;
	}
	.link {
		background: none;
		border: 0;
		color: var(--c);
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
		padding: 0;
		text-decoration: underline;
	}
	.jump {
		position: absolute;
		right: 1rem;
		bottom: 5rem;
		background: #121a28;
		color: #dbe6f5;
		border: 1px solid #1d2636;
		border-radius: 999px;
		padding: 0.25rem 0.7rem;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.say {
		display: flex;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		border-top: 1px solid #131a27;
		background: #080b13;
		align-items: flex-end;
	}
	.card {
		border: 1px solid #1d2636;
		border-radius: 8px;
		padding: 0.5rem 0.6rem;
		margin-bottom: 0.5rem;
		background: #0b0f18;
	}
	.card header {
		position: static;
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		padding: 0;
		border: 0;
		background: none;
		font-size: 0.85rem;
	}
	.card p {
		margin: 0.25rem 0;
		font-size: 0.82rem;
	}
	.card .row {
		margin-top: 0.4rem;
	}
	.prop {
		border-color: #a78bfa55;
	}
	.run {
		border-color: #7ad7a055;
	}
	.att {
		border-color: #ffb14e55;
	}
	.phase {
		display: flex;
		gap: 3px;
		margin: 0.3rem 0;
	}
	.phase span {
		flex: 1;
		height: 4px;
		border-radius: 2px;
		background: #1d2636;
	}
	.phase .done {
		background: #7ad7a0;
	}
	.phase .now {
		background: var(--c);
	}
	.steps {
		list-style: none;
		padding: 0;
		margin: 0.2rem 0 0;
		font-size: 0.72rem;
		color: #8fa3bd;
	}
	.steps i {
		color: #5c6b82;
	}
	.steps .failed {
		color: #ff6a4d;
	}
	.st {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.st.finished {
		color: #7ad7a0;
	}
	.st.failed {
		color: #ff6a4d;
	}
	.st.stopped {
		color: #ffb14e;
	}
	.feed,
	.asked {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.75rem;
		color: #8fa3bd;
	}
	.feed li,
	.asked li {
		padding: 0.15rem 0;
	}
	.feed b {
		color: #dbe6f5;
		font-weight: 500;
	}
	.asked .applied span {
		color: #7ad7a0;
	}
	.asked .refused span {
		color: #ff6a4d;
	}
	.controls {
		display: grid;
		gap: 0.4rem;
	}
	.dim {
		color: #8fa3bd;
	}
	.bad {
		color: #ff6a4d;
	}
	.center {
		text-align: center;
		padding: 2rem 1rem;
	}
	.bad.small {
		padding: 0 1rem 0.5rem;
		margin: 0;
	}
	@media (max-width: 900px) {
		.cols {
			grid-template-columns: 1fr;
		}
		.team,
		.side,
		.room {
			max-height: none;
			border: 0;
		}
		.team ul {
			display: flex;
			gap: 0.6rem;
			overflow-x: auto;
		}
		.team li {
			flex-direction: column;
			align-items: center;
			min-width: 5rem;
			text-align: center;
		}
		.purpose {
			display: none;
		}
		.lines {
			max-height: 50vh;
		}
	}
</style>
