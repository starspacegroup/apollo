<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { signIn, signOut } from '@auth/sveltekit/client';
	import type { LayoutData } from './$types';

	let { children, data }: { children: any; data: LayoutData } = $props();
	
	const session = $derived(data.session);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="navbar">
	<div class="nav-container">
		<a href="/" class="nav-brand">Apollo</a>
		<div class="nav-links">
			{#if session?.user}
				<span class="user-info">
					{#if session.user.image}
						<img src={session.user.image} alt={session.user.name || 'User'} class="user-avatar" />
					{/if}
					<span>{session.user.name || session.user.username}</span>
				</span>
				<button onclick={() => signOut()} class="btn btn-secondary">Sign Out</button>
			{:else}
				<button onclick={() => signIn('github')} class="btn btn-primary">Sign in with GitHub</button>
			{/if}
		</div>
	</div>
</nav>

{@render children?.()}
