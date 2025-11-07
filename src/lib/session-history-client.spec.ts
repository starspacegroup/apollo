import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	generateSessionId,
	saveMessage,
	loadUserHistory,
	loadSessionHistory,
	deleteUserHistory
} from './session-history-client';

// Mock fetch
global.fetch = vi.fn();

describe('Session History Client', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe('generateSessionId', () => {
		it('should generate a unique session ID', () => {
			const id1 = generateSessionId();
			const id2 = generateSessionId();

			expect(id1).toMatch(/^session_\d+_[a-z0-9]+$/);
			expect(id2).toMatch(/^session_\d+_[a-z0-9]+$/);
			expect(id1).not.toBe(id2);
		});
	});

	describe('saveMessage', () => {
		it('should save message successfully', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true })
			});

			await saveMessage('session123', 'user', 'Hello');

			expect(global.fetch).toHaveBeenCalledWith('/api/session-history', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					session_id: 'session123',
					role: 'user',
					content: 'Hello',
					metadata: undefined
				})
			});
		});

		it('should save message with metadata', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true })
			});

			await saveMessage('session123', 'assistant', 'Hi!', { repository: 'owner/repo' });

			const call = (global.fetch as any).mock.calls[0];
			const body = JSON.parse(call[1].body);

			expect(body.metadata).toEqual({ repository: 'owner/repo' });
		});

		it('should handle errors gracefully', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				json: async () => ({ message: 'Failed to save' })
			});

			// Should not throw
			await expect(saveMessage('session123', 'user', 'Hello')).resolves.not.toThrow();
		});
	});

	describe('loadUserHistory', () => {
		it('should load user history successfully', async () => {
			const mockHistory = [
				{ role: 'user', content: 'Hello' },
				{ role: 'assistant', content: 'Hi there!' }
			];

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, history: mockHistory })
			});

			const result = await loadUserHistory(50);

			expect(result).toHaveLength(2);
			expect(result[0].text).toBe('Hello');
			expect(result[1].text).toBe('Hi there!');
		});

		it('should return empty array when not authenticated', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 401
			});

			const result = await loadUserHistory();

			expect(result).toEqual([]);
		});

		it('should handle errors gracefully', async () => {
			(global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

			const result = await loadUserHistory();

			expect(result).toEqual([]);
		});
	});

	describe('loadSessionHistory', () => {
		it('should load session history successfully', async () => {
			const mockHistory = [{ role: 'user', content: 'Hello' }];

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, history: mockHistory })
			});

			const result = await loadSessionHistory('session123');

			expect(result).toHaveLength(1);
			expect(result[0].text).toBe('Hello');
		});

		it('should handle errors gracefully', async () => {
			(global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

			const result = await loadSessionHistory('session123');

			expect(result).toEqual([]);
		});
	});

	describe('deleteUserHistory', () => {
		it('should delete history successfully', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true })
			});

			const result = await deleteUserHistory();

			expect(result).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith('/api/session-history', {
				method: 'DELETE'
			});
		});

		it('should return false on error', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				json: async () => ({ success: false })
			});

			const result = await deleteUserHistory();

			expect(result).toBe(false);
		});
	});
});
