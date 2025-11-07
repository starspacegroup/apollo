<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect to home page
	onMount(() => {
		goto('/');
	});
</script>

<svelte:head>
	<title>AI Chat - Apollo</title>
	<meta
		name="description"
		content="AI Agile Product Owner Assistant for GitHub Repositories"
	/>
</svelte:head>

<div class="container">
	<p>Redirecting to home page...</p>
</div>

<style>
	.container {
		width: 100%;
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}
</style>
