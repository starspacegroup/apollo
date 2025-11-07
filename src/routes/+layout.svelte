<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { signIn, signOut } from '@auth/sveltekit/client';
	import type { LayoutData } from './$types';
	import { themeStore } from '$lib/stores/themeStore';
	import { onMount } from 'svelte';

	let { children, data }: { children: any; data: LayoutData } = $props();

	const session = $derived(data.session);

	// Initialize theme on mount
	onMount(() => {
		themeStore.init();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
