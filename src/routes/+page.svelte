<script lang="ts">
	import type { PageData } from './$types';
	import RepoSelector from '$lib/RepoSelector.svelte';
	import LiveChat from '$lib/LiveChat.svelte';
	import { repoStore } from '$lib/stores/repoStore';
	import { sessionStore, currentSession } from '$lib/stores/sessionStore';
	import { paletteOpen } from '$lib/stores/palette';
	import { signIn } from '@auth/sveltekit/client';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();
	const session = $derived(data.session);
	let repoSelector: any = $state();

	// Clear current session when on root page to ensure fresh chat
	onMount(() => {
		sessionStore.clearCurrentSession();
		// The palette is the front door. Arriving at the root means "I am here to
		// start something", and the first question is which thing — not a cursor
		// blinking in an empty box. ⌘K reopens it, Escape puts it away, and
		// resuming a conversation at /c/[id] does not open it at all.
		if (session) paletteOpen.set(true);
	});

	function changeRepo() {
		repoSelector?.openModal();
	}
</script>

<svelte:head>
	<title>Apollo - AI-Powered GitHub Assistant</title>
</svelte:head>

{#if session}
	<RepoSelector {session} bind:this={repoSelector} />

	<div class="app-container">
		<LiveChat repository={$repoStore || ''} {session} {changeRepo} />
	</div>
{:else}
	<div class="login-container">
		<div class="login-card">
			<h1>Apollo</h1>
			<p class="subtitle">AI-Powered GitHub Assistant</p>
			<p class="description">
				Sign in with Discord to see the board — what the fleet is doing on the projects you may see.
				GitHub is for the repository chat.
			</p>
			<button class="login-button" onclick={() => signIn('discord', { callbackUrl: '/board' })}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path
						d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
					/>
				</svg>
				Sign in with Discord
			</button>
			<button class="login-button secondary" onclick={() => signIn('github')}>
				<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				Sign in with GitHub
			</button>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.app-container {
		width: 100vw;
		height: 100vh;
		height: 100dvh; /* Use dynamic viewport height for mobile */
		overflow: hidden;
	}

	.login-container {
		width: 100vw;
		height: 100vh;
		height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0a0a0a;
	}

	.login-card {
		background: #111111;
		border: 1px solid #222222;
		padding: 3rem;
		border-radius: 1rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		text-align: center;
		max-width: 400px;
		width: 90%;
	}

	.login-card h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2.5rem;
		color: #ffffff;
		font-weight: 700;
	}

	.subtitle {
		margin: 0 0 1.5rem 0;
		font-size: 1.1rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		font-weight: 600;
	}

	.description {
		margin: 0 0 2rem 0;
		color: #a0a0a0;
		line-height: 1.6;
	}

	.login-button.secondary {
		opacity: 0.75;
		margin-top: 0.6rem;
	}
	.login-button {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 2rem;
		font-size: 1rem;
		font-weight: 600;
		color: #ffffff;
		background: #1a1a1a;
		border: 1px solid #10b981;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.login-button:hover {
		background: #10b981;
		color: #000000;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
	}

	.login-button:active {
		transform: translateY(0);
	}

	.login-button svg {
		width: 20px;
		height: 20px;
	}
</style>
