import { describe, it, expect } from 'vitest';
import { themeStore } from './themeStore';

describe('themeStore', () => {
	it('should always return dark theme', () => {
		const theme = themeStore.get();
		expect(theme).toBe('dark');
	});

	it('should have init method', () => {
		expect(typeof themeStore.init).toBe('function');
	});
});
