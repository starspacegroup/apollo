<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
	 * hub's ticket ends in. From then on `/live` is the Live screen, as it is
	 * in a browser; the owner's gate is unchanged and still decides who sees
	 * it.
	 */
	let step = $state('Opening…');
	let failed: string | null = $state(null);

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
			await goto('/live');
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
</style>
