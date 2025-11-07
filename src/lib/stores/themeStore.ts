import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const THEME_STORAGE_KEY = 'theme_preference';

export type Theme = 'light' | 'dark';

function createThemeStore() {
	// Get initial value from localStorage or system preference
	let initialValue: Theme = 'dark'; // Default to dark
	if (browser) {
		try {
			const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
			if (stored === 'light' || stored === 'dark') {
				initialValue = stored;
			} else {
				// Detect system preference
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				initialValue = prefersDark ? 'dark' : 'light';
			}
		} catch (e) {
			console.error('Failed to read theme from localStorage:', e);
		}
	}

	const { subscribe, set } = writable<Theme>(initialValue);

	return {
		subscribe,
		get(): Theme {
			if (!browser) return 'dark';
			try {
				const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
				if (stored === 'light' || stored === 'dark') {
					return stored;
				}
				// Fallback to system preference
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				return prefersDark ? 'dark' : 'light';
			} catch (e) {
				console.error('Failed to read theme from localStorage:', e);
				return 'dark';
			}
		},
		set(theme: Theme) {
			if (!browser) return;
			try {
				localStorage.setItem(THEME_STORAGE_KEY, theme);
				set(theme);
				// Update document class for global theme
				document.documentElement.setAttribute('data-theme', theme);
			} catch (e) {
				console.error('Failed to write theme to localStorage:', e);
			}
		},
		toggle() {
			const current = this.get();
			this.set(current === 'light' ? 'dark' : 'light');
		},
		init() {
			// Initialize theme on document
			if (browser) {
				const theme = this.get();
				document.documentElement.setAttribute('data-theme', theme);
			}
		}
	};
}

export const themeStore = createThemeStore();
