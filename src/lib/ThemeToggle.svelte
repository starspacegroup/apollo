<script lang="ts">
	import { themeStore, type Theme } from './stores/themeStore';

	let theme = $state<Theme>('dark');

	// Initialize theme
	$effect(() => {
		theme = themeStore.get();
	});

	function toggleTheme() {
		// Theme is always dark, no toggle needed
	}
</script>

<button
	class="theme-toggle"
	onclick={toggleTheme}
	aria-label="Dark mode"
	title="Dark mode"
>
	{#if theme === 'dark'}
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
