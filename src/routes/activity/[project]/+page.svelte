<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { brandOf, type Board, type Member, type RoomView } from '$lib/board';
	import { getSdk } from '$lib/activity';
	import type { PageData } from './$types';

	/**
	 * One project, inside Discord: just the agents (David, 2026-10-12: *"I
	 * want the activity interface to just be the agents, I should be able to
	 * turn them off and on, mobile first responsive, and I should be able to
	 * talk to them over voice chat through the activity"*).
	 *
	 * A grid of faces, the ones on the project first and the bench after,
	 * each with a switch; one mic. Talk and the words go over the relay to
	 * the machine, where whisper hears them and they become a line in the
	 * project's room as yours; the team's answers come back the same way as
	 * text and as speech, and the face that is speaking is lit. Nothing here
	 * starts work: a line is a line, a switch is the fleet's own switch.
	 *
	 * Inside Discord the frame never gets the microphone (discord/embedded-
	 * app-sdk#363, open), so there the voice is the voice channel itself:
	 * the person is already in it, Apollo joins it, and this page is the
	 * faces lighting as the channel is heard and answered. The mic here is
	 * for the same page opened in a browser.
	 */
	let { data }: { data: PageData } = $props();

	let board = $state<Board | null>(null);
	let error = $state<string | null>(null);
	let sock = $state<WebSocket | null>(null);
	let home = $state(false);
	let listening = $state(false);
	let hearing = $state(false);
	let thinking = $state(false);
	let speaking = $state<string | null>(null);
	let caption = $state<{ who: string; text: string; mine: boolean } | null>(null);
	let note = $state<string | null>(null);
	let draft = $state('');
	let typing = $state(false);
	let flipping = $state<Set<string>>(new Set());

	const project = $derived(data.project);
	const inDiscord = getSdk() !== null;
	/** Apollo in this project's voice channel right now (apollod voice.json by way of the snapshot). */
	const live = $derived(
		board?.voice && board.voice.project.toLowerCase() === data.project.toLowerCase() ? board.voice : null
	);
	const proj = $derived(board?.projects.find((p) => p.name === project) ?? null);
	const brand = $derived(brandOf(proj));
	const room: RoomView | null = $derived(
		(board?.rooms ?? []).find((r) => r.project === project && r.room === project) ??
			(board?.rooms ?? []).find((r) => r.project === project) ??
			null
	);
	const level = $derived(board?.viewer?.projects[project] ?? 'none');
	const owner = $derived(board?.viewer?.role === 'owner' || board?.viewer?.role === 'admin');
	const manager = $derived(owner || level === 'manager');
	const member = $derived(manager || level === 'member');
	const working = $derived(
		new Set(
			(board?.live?.working ?? [])
				.filter((w) => w.project.toLowerCase() === project.toLowerCase())
				.map((w) => w.handle.toLowerCase())
		)
	);

	function stateOf(m: Member, on: boolean): string {
		const h = m.handle.toLowerCase();
		if (speaking?.toLowerCase() === h || live?.speaking?.toLowerCase() === h) return 'speaking';
		if (working.has(h)) return 'working';
		if (on && (thinking || live?.thinking)) return 'thinking';
		return on ? '' : 'off';
	}

	// ── the board ──────────────────────────────────────────────────────────
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
			board = (await r.json()) as Board;
			error = null;
			// A switch is pending until the snapshot agrees with it.
			if (flipping.size) {
				const on = new Set(room?.team.map((m) => m.handle) ?? []);
				const next = new Set(flipping);
				for (const key of flipping) {
					const [handle, want] = key.split(':');
					if ((want === 'on') === on.has(handle)) next.delete(key);
				}
				flipping = next;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function flip(m: Member, on: boolean) {
		const key = `${m.handle}:${on ? 'on' : 'off'}`;
		flipping = new Set([...flipping, key]);
		note = null;
		try {
			const r = await fetch('/api/intents', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: on ? 'character.on' : 'character.off',
					payload: { project, character: m.handle }
				})
			});
			const body = (await r.json()) as { error?: string };
			if (!r.ok || body.error) throw new Error(body.error ?? `refused (${r.status})`);
		} catch (e) {
			flipping = new Set([...flipping].filter((k) => k !== key));
			note = e instanceof Error ? e.message : String(e);
		}
	}

	// ── the relay ──────────────────────────────────────────────────────────
	const playQueue: { who: string; blob: Blob }[] = [];
	let playing: HTMLAudioElement | null = null;
	let retry = 2000;

	async function connect() {
		if (sock) return;
		try {
			const r = await fetch('/api/activity/voice/ticket', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ project })
			});
			const body = (await r.json()) as { ticket?: string; error?: string };
			if (!body.ticket) {
				note = body.error ?? 'no ticket for the relay';
				return;
			}
			const url = new URL('/api/activity/voice/relay', location.href);
			url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
			url.searchParams.set('ticket', body.ticket);
			const ws = new WebSocket(url);
			sock = ws;
			ws.onopen = () => {
				retry = 2000;
			};
			ws.onmessage = (ev) => onRelay(JSON.parse(String(ev.data)));
			ws.onclose = () => {
				sock = null;
				home = false;
				setTimeout(connect, retry);
				retry = Math.min(retry * 2, 30000);
			};
		} catch (e) {
			note = e instanceof Error ? e.message : String(e);
			setTimeout(connect, retry);
			retry = Math.min(retry * 2, 30000);
		}
	}

	function onRelay(m: Record<string, unknown>) {
		switch (m.t) {
			case 'home':
				home = !!m.on;
				break;
			case 'heard':
				hearing = false;
				if (m.text) caption = { who: String(m.who), text: String(m.text), mine: true };
				else if (caption?.mine) caption = { who: '', text: 'I did not catch that.', mine: true };
				break;
			case 'state':
				if (typeof m.thinking === 'boolean') thinking = m.thinking;
				break;
			case 'line': {
				const who = String(m.who);
				caption = { who, text: String(m.spoken || m.text), mine: false };
				thinking = false;
				if (typeof m.audio === 'string' && m.audio) {
					const bytes = Uint8Array.from(atob(m.audio), (c) => c.charCodeAt(0));
					playQueue.push({ who, blob: new Blob([bytes], { type: String(m.mime ?? 'audio/ogg') }) });
					playNext();
				}
				break;
			}
		}
	}

	function playNext() {
		if (playing || !playQueue.length) return;
		const next = playQueue.shift()!;
		const a = new Audio(URL.createObjectURL(next.blob));
		playing = a;
		speaking = next.who;
		const done = () => {
			URL.revokeObjectURL(a.src);
			playing = null;
			speaking = null;
			playNext();
		};
		a.onended = done;
		a.onerror = done;
		a.play().catch(done);
	}

	function hush() {
		playQueue.length = 0;
		if (playing) {
			playing.pause();
			playing.onended?.(new Event('ended'));
		}
	}

	// ── the mic ────────────────────────────────────────────────────────────
	// Tap to listen; the page watches the level, cuts an utterance at 900 ms
	// of quiet, and sends it whole. Speech over the team's voice stops it.
	let stream: MediaStream | null = null;
	let recorder: MediaRecorder | null = null;
	let ctx: AudioContext | null = null;
	let meter: ReturnType<typeof setInterval> | null = null;
	let chunks: Blob[] = [];
	let spokeAt = 0;
	let startedAt = 0;
	const QUIET_MS = 900;
	const FLOOR = 0.012;
	const MAX_MS = 30000;

	async function toggleMic() {
		if (listening) {
			stopMic();
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
			});
		} catch {
			note = inDiscord
				? "Discord keeps the microphone from an Activity. Talk in the project's voice channel; Apollo is there."
				: 'The microphone was refused. Allow it and tap again.';
			return;
		}
		ctx = new AudioContext();
		await ctx.resume();
		const src = ctx.createMediaStreamSource(stream);
		const an = ctx.createAnalyser();
		an.fftSize = 1024;
		src.connect(an);
		const buf = new Float32Array(an.fftSize);
		listening = true;
		note = null;
		arm();
		meter = setInterval(() => {
			if (!recorder) return;
			an.getFloatTimeDomainData(buf);
			let sum = 0;
			for (const v of buf) sum += v * v;
			const rms = Math.sqrt(sum / buf.length);
			const now = Date.now();
			if (rms > FLOOR) {
				if (!spokeAt) hearing = true;
				spokeAt = now;
				if (playing && now - startedAt > 400) hush();
			}
			if (spokeAt && (now - spokeAt > QUIET_MS || now - startedAt > MAX_MS)) cut();
			else if (!spokeAt && now - startedAt > 15000) arm(); // nothing said: start a fresh file so it stays small
		}, 50);
	}

	function mimeFor(): string {
		for (const m of [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/mp4',
			'audio/ogg;codecs=opus'
		]) {
			if (MediaRecorder.isTypeSupported(m)) return m;
		}
		return '';
	}

	function arm() {
		if (!stream) return;
		try {
			recorder?.stop();
		} catch {
			/* not started */
		}
		chunks = [];
		spokeAt = 0;
		startedAt = Date.now();
		const mime = mimeFor();
		const rec = new MediaRecorder(
			stream,
			mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined
		);
		rec.ondataavailable = (e) => {
			if (e.data.size) chunks.push(e.data);
		};
		rec.onstop = () => {
			if (rec !== recorder) return;
			recorder = null;
		};
		recorder = rec;
		rec.start(250);
	}

	function cut() {
		const rec = recorder;
		if (!rec) return;
		const had = spokeAt > 0;
		rec.onstop = () => {
			const blob = new Blob(chunks, { type: rec.mimeType });
			if (had && blob.size > 2000 && sock?.readyState === 1) {
				hearing = true;
				caption = { who: '', text: '…', mine: true };
				blob.arrayBuffer().then((ab) => {
					let s = '';
					const u = new Uint8Array(ab);
					for (let i = 0; i < u.length; i += 0x8000)
						s += String.fromCharCode(...u.subarray(i, i + 0x8000));
					sock?.send(JSON.stringify({ t: 'utter', audio: btoa(s), mime: rec.mimeType }));
				});
			}
			recorder = null;
			if (listening) arm();
		};
		rec.stop();
	}

	function stopMic() {
		listening = false;
		hearing = false;
		if (meter) clearInterval(meter);
		meter = null;
		try {
			recorder?.stop();
		} catch {
			/* not started */
		}
		recorder = null;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		ctx?.close().catch(() => {});
		ctx = null;
	}

	function type() {
		const text = draft.trim();
		if (!text || sock?.readyState !== 1) return;
		sock.send(JSON.stringify({ t: 'say', text }));
		caption = { who: 'you', text, mine: true };
		draft = '';
		typing = false;
	}

	onMount(() => {
		read();
		connect();
		const r = setInterval(read, 5000);
		return () => {
			clearInterval(r);
			stopMic();
			sock?.close();
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
		<span
			class="pill"
			class:live={home}
			title={home ? 'The machine is on the line' : 'The machine is not on the line'}
		>
			{home ? (thinking ? 'thinking' : speaking ? 'speaking' : 'listening') : 'away'}
		</span>
	</header>

	{#if error}
		<p class="bad center">{error}</p>
	{:else if !board}
		<p class="dim center">Reading the board…</p>
	{:else if !room}
		<p class="dim center">No room for {project} has reached here yet.</p>
	{:else}
		<main>
			<section class="agents">
				{#each room.team as m (m.handle)}
					{@const s = stateOf(m, true)}
					<div class="agent {s}" class:pending={flipping.has(`${m.handle}:off`)}>
						<span class="face">
							{#if m.face}<img src={`/api/face/${m.face}`} alt="" loading="lazy" />{:else}<i
									>{m.name.slice(0, 1)}</i
								>{/if}
						</span>
						<b>{m.name}</b>
						<small>{s || m.tag}</small>
						{#if manager}
							<button
								class="switch on"
								onclick={() => flip(m, false)}
								disabled={flipping.has(`${m.handle}:off`)}
								title="Take {m.name} off {project}"
								aria-label="Turn {m.name} off"><span></span></button
							>
						{/if}
					</div>
				{/each}
				{#each room.bench ?? [] as m (m.handle)}
					<div class="agent off" class:pending={flipping.has(`${m.handle}:on`)}>
						<span class="face">
							{#if m.face}<img src={`/api/face/${m.face}`} alt="" loading="lazy" />{:else}<i
									>{m.name.slice(0, 1)}</i
								>{/if}
						</span>
						<b>{m.name}</b>
						<small>{m.tag}</small>
						{#if owner}
							<button
								class="switch"
								onclick={() => flip(m, true)}
								disabled={flipping.has(`${m.handle}:on`)}
								title="Put {m.name} on {project}"
								aria-label="Turn {m.name} on"><span></span></button
							>
						{/if}
					</div>
				{/each}
			</section>
		</main>

		<footer>
			{#if caption}
				<p class="caption" class:mine={caption.mine}>
					{#if caption.who}<b>{caption.who}</b>{/if}
					{caption.text}
				</p>
			{:else}
				<p class="caption dim">
					{#if !home}The machine is away; your words will wait.{:else if live}Apollo is in the
						voice channel with you. Just talk.{:else if inDiscord && member}Join the project's
						voice channel and talk; Apollo follows you in.{:else if member}Tap the mic and
						talk.{:else}You can watch; the owner grants a seat to speak.{/if}
				</p>
			{/if}
			{#if note}<p class="bad small">{note}</p>{/if}
			{#if member}
				{#if typing}
					<form
						class="say"
						onsubmit={(e) => {
							e.preventDefault();
							type();
						}}
					>
						<!-- svelte-ignore a11y_autofocus -->
						<input bind:value={draft} placeholder="Say something" autocomplete="off" autofocus />
						<button type="submit" disabled={!draft.trim()}>Say</button>
						<button type="button" class="ghost" onclick={() => (typing = false)} aria-label="Close"
							>×</button
						>
					</form>
				{:else}
					<div class="bar">
						<button class="ghost kb" onclick={() => (typing = true)} aria-label="Type instead"
							>⌨</button
						>
						{#if inDiscord}
							<span class="mic ear" class:on={!!live} class:hot={(live?.hearing.length ?? 0) > 0} aria-label={live ? 'Apollo is listening in the voice channel' : 'Apollo is not in a voice channel'}>
								🎧
							</span>
						{:else}
							<button
								class="mic"
								class:on={listening}
								class:hot={hearing}
								onclick={toggleMic}
								aria-pressed={listening}
								aria-label={listening ? 'Stop listening' : 'Talk'}
							>
								{listening ? '■' : '🎙'}
							</button>
						{/if}
						<button class="ghost kb" onclick={hush} aria-label="Quiet" title="Stop the voice"
							>🔇</button
						>
					</div>
				{/if}
			{/if}
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
		-webkit-text-size-adjust: 100%;
	}
	.app {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		max-width: 1000px;
		margin: 0 auto;
		box-sizing: border-box;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px 6px;
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
		padding: 6px;
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

	main {
		flex: 1;
		overflow-y: auto;
		padding: 6px 14px 12px;
	}
	.agents {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 10px 6px;
	}
	@media (min-width: 600px) {
		.agents {
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
			gap: 14px 10px;
		}
	}
	.agent {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 6px 0;
		text-align: center;
	}
	.agent b {
		font-size: 12px;
		max-width: 100%;
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
		width: 72px;
		height: 72px;
		border-radius: 50%;
		overflow: hidden;
		background: #1a2130;
		display: grid;
		place-items: center;
		border: 3px solid transparent;
		transition:
			border-color 0.2s,
			box-shadow 0.2s,
			filter 0.3s;
	}
	@media (min-width: 600px) {
		.face {
			width: 92px;
			height: 92px;
		}
	}
	.face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.face i {
		font-style: normal;
		font-size: 26px;
		color: #9aa7b8;
	}
	.agent.off .face {
		filter: grayscale(1) brightness(0.55);
	}
	.agent.off b,
	.agent.pending b {
		color: #7f8ca0;
	}
	.agent.pending .face {
		animation: pulse 1.2s ease-in-out infinite;
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
	.switch {
		margin-top: 4px;
		width: 34px;
		height: 20px;
		border-radius: 999px;
		border: 0;
		background: #2a3340;
		position: relative;
		cursor: pointer;
		padding: 0;
	}
	.switch span {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #9aa7b8;
		transition: left 0.15s;
	}
	.switch.on {
		background: var(--c);
	}
	.switch.on span {
		left: 16px;
		background: #0b0e14;
	}
	.switch:disabled {
		opacity: 0.5;
	}

	footer {
		padding: 8px 14px calc(10px + env(safe-area-inset-bottom));
		border-top: 1px solid #1a2130;
		background: #0b0e14;
	}
	.caption {
		margin: 0 0 8px;
		min-height: 1.4em;
		font-size: 14px;
		color: #e6ebf2;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.caption b {
		color: var(--c);
		margin-right: 6px;
	}
	.caption.mine b,
	.caption.mine {
		color: #f0b35a;
	}
	.caption.dim {
		color: #6b7a90;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 28px;
	}
	.mic {
		width: 68px;
		height: 68px;
		border-radius: 50%;
		border: 2px solid var(--c);
		background: #121826;
		color: var(--c);
		font-size: 26px;
		cursor: pointer;
		transition: box-shadow 0.15s;
	}
	.mic.on {
		background: var(--c);
		color: #0b0e14;
	}
	.mic.hot {
		box-shadow: 0 0 0 8px color-mix(in srgb, var(--c) 25%, transparent);
	}
	.ear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: default;
		opacity: 0.45;
	}
	.ear.on {
		opacity: 1;
	}
	.kb {
		font-size: 20px;
	}
	.say {
		display: flex;
		gap: 8px;
	}
	.say input {
		flex: 1;
		min-width: 0;
		background: #121826;
		border: 1px solid #2a3340;
		color: inherit;
		border-radius: 10px;
		padding: 10px 12px;
		font: inherit;
	}
	.say button[type='submit'] {
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
		margin: 0 0 6px;
	}
</style>
