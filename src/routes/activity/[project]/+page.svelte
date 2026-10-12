<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { brandOf, type Board, type Line, type Member, type RoomView } from '$lib/board';
	import {
		avatarOf,
		channelId,
		onSpeaking,
		openLink,
		participants,
		type Participant
	} from '$lib/activity';
	import type { PageData } from './$types';

	/**
	 * One project, inside Discord — the simple view (David, 2026-10-12: *"I
	 * wanted a much more simple view of the agents, and I should be able to
	 * talk to them with realtime voice"*).
	 *
	 * The team as faces, each one lit when it is speaking, thinking or
	 * working; the people in the voice channel, lit when they talk; the
	 * conversation as the room has it; one box to type. Talking happens in
	 * the voice channel itself — `apollo-voice` is in it, hearing everyone
	 * and reading the team's answers aloud — so this page listens for the
	 * same thing it shows. Everything typed here is a room line on the same
	 * wire the hosted board uses; nothing here starts work.
	 */
	let { data }: { data: PageData } = $props();

	let board = $state<Board | null>(null);
	let error = $state<string | null>(null);
	let now = $state(Date.now());
	let here = $state<Participant[]>([]);
	let talking = $state<Set<string>>(new Set());
	let draft = $state('');
	let note = $state<string | null>(null);
	let pending = $state<Line[]>([]);
	let feedEl = $state<HTMLDivElement | undefined>();
	let stuck = $state(true);

	const project = $derived(data.project);
	const proj = $derived(board?.projects.find((p) => p.name === project) ?? null);
	const brand = $derived(brandOf(proj));
	const rooms = $derived((board?.rooms ?? []).filter((r) => r.project === project));
	const room: RoomView | null = $derived(
		rooms.find((r) => r.room === (data.room ?? project)) ??
			rooms.find((r) => r.room === project) ??
			rooms[0] ??
			null
	);
	const voice = $derived(board?.voice?.project === project ? board.voice : null);
	const botTalking = $derived(!!data.clientId && talking.has(data.clientId));
	const lines: Line[] = $derived(
		[...(room?.lines ?? []), ...pending].filter((l) => l.kind === 'said' || l.kind === 'mail')
	);
	const lastTeamLine = $derived(
		[...lines].reverse().find((l) => l.provenance !== 'david' && l.provenance !== 'outside')
	);
	const level = $derived(board?.viewer?.projects[project] ?? 'none');
	const member = $derived(
		board?.viewer?.role === 'owner' ||
			board?.viewer?.role === 'admin' ||
			level === 'manager' ||
			level === 'member'
	);
	const inFlight = $derived(
		(board?.live?.working ?? []).filter((w) => w.project.toLowerCase() === project.toLowerCase())
	);

	/** What a face is doing, in one word. The voice daemon's word wins over the room's guess. */
	function stateOf(m: Member): 'speaking' | 'thinking' | 'working' | '' {
		const h = m.handle.toLowerCase();
		if (voice?.speaking?.toLowerCase() === h) return 'speaking';
		if (botTalking && !voice?.speaking && lastTeamLine?.who.toLowerCase() === h) return 'speaking';
		if (inFlight.some((w) => w.handle.toLowerCase() === h)) return 'working';
		if (voice?.thinking) return 'thinking';
		return '';
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
			const said = new Set((b.rooms ?? []).flatMap((x) => x.lines.map((l) => l.text.trim())));
			pending = pending.filter(
				(p) => !said.has(p.text.trim()) && Date.now() - Date.parse(p.at) < 120000
			);
			board = b;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
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
		note = null;
		try {
			const r = await fetch('/api/intents', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind: 'room.say', payload: { project, room: room.room, text } })
			});
			const body = (await r.json()) as { error?: string };
			if (!r.ok || body.error) throw new Error(body.error ?? `refused (${r.status})`);
		} catch (e) {
			pending = pending.filter((p) => p !== mine);
			draft = text;
			note = e instanceof Error ? e.message : String(e);
		}
	}

	function mention(m: Member) {
		draft = draft ? `${draft.trimEnd()} @${m.name} ` : `@${m.name} `;
		document.getElementById('say')?.focus();
	}
	function clock(at: string): string {
		return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
		participants().then((p) => (here = p));
		const ch = channelId();
		const off = ch
			? onSpeaking(ch, (id, on) => {
					const next = new Set(talking);
					if (on) next.add(id);
					else next.delete(id);
					talking = next;
				})
			: () => {};
		const t = setInterval(() => (now = Date.now()), 1000);
		const r = setInterval(read, 4000);
		const h = setInterval(() => participants().then((p) => (here = p)), 20000);
		return () => {
			off();
			clearInterval(t);
			clearInterval(r);
			clearInterval(h);
		};
	});
</script>

<svelte:head>
	<title>{project} · Apollo</title>
</svelte:head>

<div class="app" style:--c={brand.color ?? '#59d9ff'}>
	<header>
		<button class="ghost" onclick={() => goto('/activity?frame_id=kept')} aria-label="Back"
			>‹</button
		>
		{#if brand.logo}<img class="mark" src={brand.logo} alt="" />{/if}
		<h1>{project}</h1>
		<span class="grow"></span>
		{#if voice}
			<span class="pill live" title="Apollo is in the voice channel"
				>{voice.thinking ? 'thinking' : voice.speaking ? 'speaking' : 'listening'}</span
			>
		{:else if board}
			<span class="pill" title="Join the project's voice channel and Apollo joins too"
				>not in voice</span
			>
		{/if}
	</header>

	{#if error}
		<p class="bad center">{error}</p>
	{:else if !board}
		<p class="dim center">Reading the board…</p>
	{:else if !room}
		<p class="dim center">No room for {project} has reached here yet.</p>
	{:else}
		<!-- ── the team ───────────────────────────────────────────────── -->
		<section class="team">
			{#each room.team as m (m.handle)}
				{@const s = stateOf(m)}
				<button class="agent {s}" onclick={() => mention(m)} title={`@${m.name} — ${m.purpose}`}>
					<span class="face">
						{#if m.face}<img src={`/api/face/${m.face}`} alt="" loading="lazy" />{:else}<i
								>{m.name.slice(0, 1)}</i
							>{/if}
					</span>
					<b>{m.name}</b>
					<small>{s || m.tag}</small>
				</button>
			{/each}
		</section>

		<!-- ── the people ─────────────────────────────────────────────── -->
		{#if here.length || voice?.people.length}
			<section class="people">
				{#each here as p (p.id)}
					<span
						class="person"
						class:on={talking.has(p.id)}
						class:heard={voice?.hearing.includes(p.id)}
						title={p.global_name || p.username}
					>
						{#if avatarOf(p)}<img src={avatarOf(p)} alt="" />{:else}<i
								>{(p.global_name || p.username).slice(0, 1)}</i
							>{/if}
						<small>{p.global_name || p.username}</small>
					</span>
				{/each}
				{#each (voice?.people ?? []).filter((v) => !here.some((p) => p.id === v.id)) as v (v.id)}
					<span
						class="person"
						class:on={talking.has(v.id)}
						class:heard={voice?.hearing.includes(v.id)}
						title={v.name}
					>
						<i>{v.name.slice(0, 1)}</i>
						<small>{v.name}</small>
					</span>
				{/each}
				<small class="hint">
					{#if voice}Apollo hears everyone here and answers aloud.{:else}Join the voice channel to
						talk.{/if}
				</small>
			</section>
		{/if}

		<!-- ── the conversation ──────────────────────────────────────── -->
		<div class="feed" bind:this={feedEl} onscroll={onScroll}>
			{#each lines as l (l.id)}
				<div
					class="line"
					class:person={l.provenance === 'david' || l.provenance === 'outside'}
					class:spoken={l.reference === 'voice'}
				>
					<span class="who"
						>{l.name}{#if l.reference === 'voice'}<em title="said aloud"> 🎙</em>{/if}
						<time>{clock(l.at)}</time></span
					>
					<p>{l.text}</p>
				</div>
			{/each}
			{#if voice?.thinking}
				<div class="line dim"><p>…</p></div>
			{/if}
		</div>

		<!-- ── say ───────────────────────────────────────────────────── -->
		{#if member}
			<form
				class="say"
				onsubmit={(e) => {
					e.preventDefault();
					say();
				}}
			>
				<input
					id="say"
					bind:value={draft}
					placeholder={voice ? 'Say something — or just talk' : 'Say something'}
					autocomplete="off"
				/>
				<button type="submit" disabled={!draft.trim()}>Say</button>
			</form>
			{#if note}<p class="bad small">{note}</p>{/if}
		{:else}
			<p class="dim small center">You can read along here; the owner grants a seat to speak.</p>
		{/if}
		<footer>
			<span>{inFlight.length ? `${inFlight.length} working` : 'nothing running'}</span>
			<button class="ghost" onclick={() => openLink('https://apollo.starspace.group/')}
				>the board ↗</button
			>
		</footer>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		background: #0b0e14;
		color: #e6ebf2;
		font:
			15px/1.4 system-ui,
			sans-serif;
	}
	.app {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		max-width: 900px;
		margin: 0 auto;
		padding: 0 12px;
		box-sizing: border-box;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 0 6px;
	}
	header h1 {
		font-size: 17px;
		margin: 0;
	}
	.mark {
		width: 22px;
		height: 22px;
		border-radius: 6px;
	}
	.grow {
		flex: 1;
	}
	.ghost {
		background: none;
		border: 0;
		color: #9aa7b8;
		font-size: 18px;
		cursor: pointer;
	}
	.pill {
		font-size: 11px;
		padding: 3px 9px;
		border-radius: 999px;
		border: 1px solid #2a3340;
		color: #9aa7b8;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.pill.live {
		color: var(--c);
		border-color: var(--c);
	}

	.team {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 6px 0 10px;
		scrollbar-width: none;
	}
	.agent {
		flex: 0 0 auto;
		width: 92px;
		background: none;
		border: 0;
		color: inherit;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		cursor: pointer;
		padding: 4px 0;
	}
	.agent b {
		font-size: 12px;
		max-width: 90px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.agent small {
		font-size: 11px;
		color: #7f8ca0;
		text-transform: lowercase;
	}
	.face {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		overflow: hidden;
		background: #1a2130;
		display: grid;
		place-items: center;
		border: 3px solid transparent;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.face i {
		font-style: normal;
		font-size: 24px;
		color: #9aa7b8;
	}
	.agent.speaking .face {
		border-color: var(--c);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 30%, transparent);
		animation: pulse 1s ease-in-out infinite;
	}
	.agent.speaking small {
		color: var(--c);
	}
	.agent.thinking .face {
		border-color: #6b7a90;
		animation: pulse 1.6s ease-in-out infinite;
	}
	.agent.working .face {
		border-color: #f0b35a;
	}
	.agent.working small {
		color: #f0b35a;
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 8px color-mix(in srgb, var(--c) 10%, transparent);
		}
	}

	.people {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 4px 0 10px;
		border-top: 1px solid #1a2130;
		border-bottom: 1px solid #1a2130;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #9aa7b8;
	}
	.person img,
	.person i {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid transparent;
		display: grid;
		place-items: center;
		background: #1a2130;
		font-style: normal;
		font-size: 13px;
		transition: border-color 0.15s;
	}
	.person.on img,
	.person.on i {
		border-color: #4ade80;
	}
	.person.heard small {
		color: #4ade80;
	}
	.hint {
		margin-left: auto;
		font-size: 11px;
		color: #6b7a90;
	}

	.feed {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.line .who {
		font-size: 12px;
		color: var(--c);
		font-weight: 600;
	}
	.line.person .who {
		color: #f0b35a;
	}
	.line time {
		font-weight: 400;
		color: #6b7a90;
		margin-left: 6px;
		font-size: 11px;
	}
	.line p {
		margin: 2px 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.line.dim p {
		color: #6b7a90;
	}

	.say {
		display: flex;
		gap: 8px;
		padding: 8px 0;
		border-top: 1px solid #1a2130;
	}
	.say input {
		flex: 1;
		background: #121826;
		border: 1px solid #2a3340;
		color: inherit;
		border-radius: 10px;
		padding: 10px 12px;
		font: inherit;
	}
	.say button {
		background: var(--c);
		color: #0b0e14;
		border: 0;
		border-radius: 10px;
		padding: 0 16px;
		font-weight: 600;
		cursor: pointer;
	}
	.say button:disabled {
		opacity: 0.4;
	}
	footer {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: #6b7a90;
		padding: 0 0 8px;
	}
	footer .ghost {
		font-size: 11px;
	}
	.center {
		text-align: center;
		margin-top: 40px;
	}
	.dim {
		color: #6b7a90;
	}
	.bad {
		color: #f87171;
	}
	.small {
		font-size: 12px;
	}
</style>
