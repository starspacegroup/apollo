<script lang="ts">
	import { themeStore, type Theme } from './stores/themeStore';

	let theme = $state<Theme>('dark');

	// Subscribe to theme changes using $effect
	$effect(() => {
		theme = themeStore.get();
		const unsubscribe = themeStore.subscribe((value) => {
			theme = value;
		});
		return unsubscribe;
	});

	function toggleTheme() {
		themeStore.toggle();
	}
</script>

<button
	class="theme-toggle"
	onclick={toggleTheme}
	aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
	title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
>
	{#if theme === 'light'}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="12" cy="12" r="5"></circle>
			<line x1="12" y1="1" x2="12" y2="3"></line>
			<line x1="12" y1="21" x2="12" y2="23"></line>
			<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
			<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
			<line x1="1" y1="12" x2="3" y2="12"></line>
			<line x1="21" y1="12" x2="23" y2="12"></line>
			<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
			<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
		</svg>
	{/if}
</button>

<style>
	.theme-toggle {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.375rem;
		transition: all 0.2s;
		color: var(--theme-toggle-color, currentColor);
	}

	.theme-toggle:hover {
		background: var(--theme-toggle-hover-bg, rgba(255, 255, 255, 0.1));
	}

	.theme-toggle:active {
		transform: scale(0.95);
	}

	svg {
		width: 20px;
		height: 20px;
	}
</style>
