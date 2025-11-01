<script lang="ts">
	import type { PageData } from './$types';
	import RepoSelector from '$lib/RepoSelector.svelte';
	import { repoStore } from '$lib/stores/repoStore';
	
	let { data }: { data: PageData } = $props();
	const session = $derived(data.session);
	let repoSelector: any;

	function changeRepo() {
		repoSelector?.openModal();
	}
</script>

<svelte:head>
	<title>Apollo - SvelteKit App</title>
</svelte:head>

<RepoSelector {session} bind:this={repoSelector} />

<div class="container">
	<h1>Welcome to Apollo</h1>
	<p class="subtitle">Your AI-Powered Agile Product Management Assistant</p>
	<p class="description">
		Apollo helps you manage your GitHub repositories like a Product Owner in Agile fashion. 
		Create, organize, and prioritize issues with AI assistance to keep your development workflow efficient and focused.
	</p>

	{#if session?.user}
		<div class="auth-status">
			<span class="status-badge">✓ Authenticated as {session.user.name || session.user.username}</span>
			{#if $repoStore}
				<div class="repo-info">
					<span class="status-badge repo">📁 Working on: {$repoStore}</span>
					<button onclick={changeRepo} class="btn-change-repo">Change Repository</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="auth-status">
			<span class="status-badge warning">⚠️ Please sign in with GitHub to use the app</span>
		</div>
	{/if}

	<div class="features">
		<a href="/voice" class="feature-card" class:disabled={!session?.user}>
			<div class="icon">🎤</div>
			<h2>AI Voice Chat</h2>
			<p>Real-time voice conversation with AI powered by OpenAI and Cloudflare Workers</p>
			<span class="cta">Try it now →</span>
		</a>
	</div>
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 4rem 2rem;
		text-align: center;
	}

	h1 {
		font-size: 3rem;
		font-weight: 700;
		margin-bottom: 1rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		font-size: 1.25rem;
		color: #6b7280;
		margin-bottom: 1rem;
		font-weight: 500;
	}

	.description {
		font-size: 1rem;
		color: #6b7280;
		margin-bottom: 3rem;
		max-width: 700px;
		margin-left: auto;
		margin-right: auto;
		line-height: 1.7;
	}

	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 2rem;
		margin-top: 3rem;
	}

	.feature-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 1rem;
		text-decoration: none;
		color: inherit;
		transition: all 0.3s ease;
	}

	.feature-card:hover {
		transform: translateY(-8px);
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.1),
			0 8px 10px -6px rgb(0 0 0 / 0.1);
		border-color: #667eea;
	}

	.icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.feature-card h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: #111827;
	}

	.feature-card p {
		color: #6b7280;
		margin-bottom: 1rem;
		line-height: 1.6;
	}

	.cta {
		color: #667eea;
		font-weight: 600;
		margin-top: auto;
	}

	.auth-status {
		margin: 2rem 0;
	}

	.status-badge {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 600;
		background: #d1fae5;
		color: #065f46;
		margin: 0.25rem;
	}

	.status-badge.warning {
		background: #fef3c7;
		color: #92400e;
	}

	.status-badge.repo {
		background: #dbeafe;
		color: #1e40af;
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.9rem;
	}

	.repo-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.btn-change-repo {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 2px solid #667eea;
		color: #667eea;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.875rem;
	}

	.btn-change-repo:hover {
		background: #667eea;
		color: white;
		transform: translateY(-1px);
	}

	.feature-card.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
