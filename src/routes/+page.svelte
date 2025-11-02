<script lang="ts">
	import type { PageData } from './$types';
	import RepoSelector from '$lib/RepoSelector.svelte';
	import VoiceChat from '$lib/VoiceChat.svelte';
	import { repoStore } from '$lib/stores/repoStore';

	let { data }: { data: PageData } = $props();
	const session = $derived(data.session);
	let repoSelector: any;

	function changeRepo() {
		repoSelector?.openModal();
	}
</script>

<svelte:head>
	<title>Apollo - AI-Powered GitHub Assistant</title>
</svelte:head>

<RepoSelector {session} bind:this={repoSelector} />

<div class="app-container">
	<VoiceChat repository={$repoStore || ''} {session} {changeRepo} />
</div>

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
</style>
