import { describe, it, expect, beforeEach, vi } from 'vitest';
import { themeStore } from './themeStore';

// Mock browser environment
const mockLocalStorage = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		}
	};
})();

describe('themeStore', () => {
	beforeEach(() => {
		// Clear localStorage before each test
		mockLocalStorage.clear();
		// Mock localStorage in global scope
		Object.defineProperty(global, 'localStorage', {
			value: mockLocalStorage,
			writable: true
		});
	});

	it('should default to dark theme', () => {
		const theme = themeStore.get();
		expect(theme).toBe('dark');
	});

	it('should set theme to light', () => {
		themeStore.set('light');
		const theme = themeStore.get();
		expect(theme).toBe('light');
	});

	it('should set theme to dark', () => {
		themeStore.set('dark');
		const theme = themeStore.get();
		expect(theme).toBe('dark');
	});

	it('should toggle theme from dark to light', () => {
		themeStore.set('dark');
		themeStore.toggle();
		const theme = themeStore.get();
		expect(theme).toBe('light');
	});

	it('should toggle theme from light to dark', () => {
		themeStore.set('light');
		themeStore.toggle();
		const theme = themeStore.get();
		expect(theme).toBe('dark');
	});

	it('should persist theme to localStorage', () => {
		themeStore.set('light');
		expect(mockLocalStorage.getItem('theme_preference')).toBe('light');
	});

	it('should read theme from localStorage', () => {
		mockLocalStorage.setItem('theme_preference', 'light');
		const theme = themeStore.get();
		expect(theme).toBe('light');
	});
});
