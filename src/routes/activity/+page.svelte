<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setSdk } from '$lib/activity';
	import type { Board } from '$lib/board';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The Discord Activity's front door (David, 2026-10-10: *"enable Apollo on
	 * Discord as an activity that can be used in one or more channels on the
	 * Apollo discord server"*).
	 *
	 * Discord opens this app in an iframe at `<app id>.discordsays.com`, which
	 * its proxy forwards to `apollo.starspace.group`. Nothing about the hub's
	 * login works in there: a redirect out to `dirac.davis9001.dev` is a page
	 * Discord's sandbox will not show. So the Activity signs in by the only
	 * door the sandbox has — the Embedded App SDK asks Discord for a code,
	 * `/api/activity/token` spends it for a token and asks Discord who that
	 * is, and the answer is a pass cookie of this app's own, the same one the
	 * hub's ticket ends in.
	 *
	 * Then, since 2026-10-12, the room: the channel the Activity was opened
	 * in — a project's voice channel, or one of its text channels — names the
	 * project, and the project's page opens. Opened anywhere else, it asks.
	 */
	let step = $state('Opening…');
	let failed: string | null = $state(null);
	let choices: { name: string; color: string | null; logo: string | null }[] = $state([]);

	onMount(async () => {
		const frame = new URLSearchParams(location.search).get('frame_id');
		if (!frame) {
			failed = 'This page only opens inside Discord, as the Apollo activity.';
			return;
		}
		if (!data.clientId) {
			failed = 'The Worker does not know its Discord application id.';
			return;
		}
		try {
			step = 'Talking to Discord…';
			const { DiscordSDK } = await import('@discord/embedded-app-sdk');
			const sdk = new DiscordSDK(data.clientId);
			await sdk.ready();
			step = 'Asking who you are…';
			const { code } = await sdk.commands.authorize({
				client_id: data.clientId,
				response_type: 'code',
				state: '',
				prompt: 'none',
				scope: ['identify']
			});
			step = 'Signing in…';
			const res = await fetch('/api/activity/token', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code })
			});
			if (!res.ok) {
				failed = `Sign-in refused (${res.status}).`;
				return;
			}
			const { access_token } = (await res.json()) as { access_token: string };
			const auth = await sdk.commands.authenticate({ access_token });
			if (!auth) {
				failed = 'Discord did not confirm the sign-in.';
				return;
			}
			setSdk(sdk);

			step = 'Finding the room…';
			const b = await fetch('/api/board');
			if (b.status === 403) {
				failed = 'This is a private board. You are signed in, but it is not yours.';
				return;
			}
			if (!b.ok) {
				failed = `The board answered ${b.status}.`;
				return;
			}
			const board = (await b.json()) as Board;
			const here = sdk.channelId;
			const hit = here ? board.discord?.channels.find((c) => c.id === here) : undefined;
			if (hit) {
				const room =
					hit.room && hit.room !== hit.project ? `?room=${encodeURIComponent(hit.room)}` : '';
				await goto(`/activity/${encodeURIComponent(hit.project)}${room}`);
				return;
			}
			// Opened somewhere that is no project's channel: a DM, the
			// server's front door. Ask which project.
			choices = (board.projects ?? []).map((p) => ({ name: p.name, color: p.color, logo: p.logo }));
			if (choices.length === 0) {
				failed = 'No project is yours to see here yet.';
				return;
			}
			step = 'Which project?';
		} catch (e) {
			failed = e instanceof Error ? e.message : String(e);
		}
	});
</script>

<svelte:head>
	<title>Apollo</title>
</svelte:head>

<main>
	{#if failed}
		<p class="bad">{failed}</p>
	{:else if choices.length > 0}
		<div class="pick">
			<p>{step}</p>
			<ul>
				{#each choices as c (c.name)}
					<li>
						<a href={`/activity/${encodeURIComponent(c.name)}`} style:--c={c.color ?? '#59d9ff'}>
							{#if c.logo}<img src={c.logo} alt="" />{/if}
							<span>{c.name}</span>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p>{step}</p>
	{/if}
</main>

<style>
	main {
		min-height: 100vh;
		margin: 0;
		display: grid;
		place-items: center;
		background: #05070d;
		color: #dbe6f5;
		font:
			16px system-ui,
			sans-serif;
	}
	.bad {
		color: #ff6a4d;
		max-width: 32rem;
		text-align: center;
		padding: 0 1rem;
	}
	.pick {
		width: min(100%, 36rem);
		padding: 1rem;
	}
	.pick p {
		color: #8fa3bd;
		margin: 0 0 0.75rem;
	}
	.pick ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.5rem;
	}
	.pick a {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid #1d2636;
		border-left: 3px solid var(--c);
		border-radius: 6px;
		color: inherit;
		text-decoration: none;
		background: #0b0f18;
	}
	.pick a:hover {
		background: #121a28;
	}
	.pick img {
		width: 20px;
		height: 20px;
		object-fit: contain;
	}
</style>
