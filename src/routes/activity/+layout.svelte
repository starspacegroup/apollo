<script lang="ts">
	import { updated } from '$app/state';
	import { reloadInPlace } from '$lib/activity';

	let { children } = $props();

	// A new build was deployed (`kit.version.pollInterval`): reload into it
	// where we are, signed in, without David closing the Activity.
	let reloading = false;
	$effect(() => {
		if (updated.current && !reloading) {
			reloading = true;
			reloadInPlace();
		}
	});
</script>

{@render children()}
