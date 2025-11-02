import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

const REPO_STORAGE_KEY = 'github_repo';

function createRepoStore() {
	// Get initial value safely
	let initialValue: string | null = null;
	if (browser) {
		try {
			initialValue = localStorage.getItem(REPO_STORAGE_KEY);
		} catch (e) {
			console.error('Failed to read from localStorage:', e);
		}
	}

	const { subscribe, set, update } = writable<string | null>(initialValue);

	return {
		subscribe,
		get(): string | null {
			if (!browser) return null;
			try {
				return localStorage.getItem(REPO_STORAGE_KEY);
			} catch (e) {
				console.error('Failed to read from localStorage:', e);
				return null;
			}
		},
		set(repo: string) {
			if (!browser) return;
			try {
				localStorage.setItem(REPO_STORAGE_KEY, repo);
				set(repo);
			} catch (e) {
				console.error('Failed to write to localStorage:', e);
			}
		},
		clear() {
			if (!browser) return;
			try {
				localStorage.removeItem(REPO_STORAGE_KEY);
				set(null);
			} catch (e) {
				console.error('Failed to clear localStorage:', e);
			}
		}
	};
}

export const repoStore = createRepoStore();
