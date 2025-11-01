<script lang="ts">
	import VoiceChat from '$lib/VoiceChat.svelte';
</script>

<svelte:head>
	<title>AI Voice Chat - Apollo</title>
	<meta
		name="description"
		content="Real-time voice chat with AI powered by OpenAI and Cloudflare"
	/>
</svelte:head>

<div class="container">
	<VoiceChat />
</div>

<style>
	.container {
		width: 100%;
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}
</style>
