<script lang="ts">
	import type { PageData } from './$types';
	import LiveChat from '$lib/LiveChat.svelte';
	import RepoSelector from '$lib/RepoSelector.svelte';
	import { repoStore } from '$lib/stores/repoStore';
	import { sessionStore } from '$lib/stores/sessionStore';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	const session = $derived(data.session);
	const sessionId = $derived(data.sessionId);

	let repoSelector: any = $state();
	let currentRepository = $state('');

	// Load the session when sessionId changes
	$effect(() => {
		if (sessionId) {
			// Try to switch to this session
			sessionStore.switchSession(sessionId);

			// Check if session exists and load repository
			const currentSession = sessionStore.getCurrentSession();
			if (!currentSession) {
				// Session doesn't exist, redirect to home
				goto('/');
			} else {
				// Set repository from session
				currentRepository = currentSession.repository;
				if (currentSession.repository) {
					repoStore.set(currentSession.repository);
				}
			}
		}
	});

	function changeRepo() {
		repoSelector?.openModal();
	}
</script>

<svelte:head>
	<title>Apollo - Chat Session</title>
</svelte:head>

{#if session}
	<RepoSelector {session} bind:this={repoSelector} />

	<div class="app-container">
		<LiveChat
			repository={currentRepository || $repoStore || ''}
			{session}
			{changeRepo}
			{sessionId}
		/>
	</div>
{:else}
	<div class="login-container">
		<div class="login-card">
			<h1>Apollo</h1>
			<p class="subtitle">AI-Powered GitHub Assistant</p>
			<p class="description">Please sign in to continue.</p>
			<button class="login-button" onclick={() => goto('/')}> Go to Home </button>
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
		height: 100dvh;
		overflow: hidden;
	}

	.login-container {
		width: 100vw;
		height: 100vh;
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

	.login-button {
		width: 100%;
		padding: 1rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}

	.login-button:hover {
		transform: translateY(-2px);
	}
</style>
