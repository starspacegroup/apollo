import { browser } from '$app/environment';

// Always use dark theme - no toggling
export type Theme = 'dark';

const THEME: Theme = 'dark';

function createThemeStore() {
	return {
		get(): Theme {
			return THEME;
		},
		init() {
			// Initialize dark theme on document
			if (browser) {
				document.documentElement.setAttribute('data-theme', THEME);
			}
		}
	};
}

export const themeStore = createThemeStore();
