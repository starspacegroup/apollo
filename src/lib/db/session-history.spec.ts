import { describe, it, expect, beforeEach } from 'vitest';
import { createSessionHistoryService, type SessionMessage } from './session-history';

// Mock D1Database for testing
class MockD1Database {
	private data: Map<string, any[]> = new Map();

	prepare(query: string) {
		return {
			bind: (...args: any[]) => ({
				run: async () => {
					// Extract table name and operation type from query
					if (query.includes('INSERT INTO session_history')) {
						const [user_id, session_id, role, content, metadata] = args;
						if (!this.data.has('session_history')) {
							this.data.set('session_history', []);
						}
						const messages = this.data.get('session_history')!;
						messages.push({
							id: messages.length + 1,
							user_id,
							session_id,
							role,
							content,
							created_at: Math.floor(Date.now() / 1000),
							metadata
						});
					} else if (query.includes('DELETE FROM session_history')) {
						const [user_id] = args;
						const messages = this.data.get('session_history') || [];
						this.data.set(
							'session_history',
							messages.filter((m) => m.user_id !== user_id)
						);
					}
					return { success: true };
				},
				all: async () => {
					const messages = this.data.get('session_history') || [];

					if (query.includes('WHERE user_id = ?')) {
						const [user_id, limit] = args;
						const filtered = messages
							.filter((m: any) => m.user_id === user_id)
							.slice(0, limit || 100);
						return { results: filtered };
					} else if (query.includes('WHERE session_id = ?')) {
						const [session_id] = args;
						const filtered = messages.filter((m: any) => m.session_id === session_id);
						return { results: filtered };
					}

					return { results: messages };
				}
			})
		};
	}

	async exec(sql: string) {
		// Mock schema creation
		return { success: true };
	}
}

describe('Session History Service', () => {
	let db: D1Database;
	let service: ReturnType<typeof createSessionHistoryService>;

	beforeEach(() => {
		db = new MockD1Database() as unknown as D1Database;
		service = createSessionHistoryService(db);
	});

	describe('initializeDatabase', () => {
		it('should initialize database without errors', async () => {
			await expect(service.initializeDatabase()).resolves.not.toThrow();
		});
	});

	describe('saveMessage', () => {
		it('should save a message successfully', async () => {
			const message: Omit<SessionMessage, 'id' | 'created_at'> = {
				user_id: 'user123',
				session_id: 'session456',
				role: 'user',
				content: 'Hello, world!'
			};

			await expect(service.saveMessage(message)).resolves.not.toThrow();
		});

		it('should save message with metadata', async () => {
			const message: Omit<SessionMessage, 'id' | 'created_at'> = {
				user_id: 'user123',
				session_id: 'session456',
				role: 'assistant',
				content: 'Hi there!',
				metadata: '{"repository":"owner/repo"}'
			};

			await expect(service.saveMessage(message)).resolves.not.toThrow();
		});
	});

	describe('getUserHistory', () => {
		beforeEach(async () => {
			await service.saveMessage({
				user_id: 'user123',
				session_id: 'session456',
				role: 'user',
				content: 'Message 1'
			});

			await service.saveMessage({
				user_id: 'user123',
				session_id: 'session456',
				role: 'assistant',
				content: 'Message 2'
			});

			await service.saveMessage({
				user_id: 'user999',
				session_id: 'session789',
				role: 'user',
				content: 'Other user message'
			});
		});

		it('should get messages for specific user', async () => {
			const history = await service.getUserHistory('user123');

			expect(history).toHaveLength(2);
			expect(history[0].user_id).toBe('user123');
			expect(history[1].user_id).toBe('user123');
		});

		it('should respect limit parameter', async () => {
			const history = await service.getUserHistory('user123', 1);

			expect(history).toHaveLength(1);
		});

		it('should return empty array for user with no history', async () => {
			const history = await service.getUserHistory('nonexistent');

			expect(history).toHaveLength(0);
		});
	});

	describe('getSessionHistory', () => {
		beforeEach(async () => {
			await service.saveMessage({
				user_id: 'user123',
				session_id: 'session456',
				role: 'user',
				content: 'Message 1'
			});

			await service.saveMessage({
				user_id: 'user123',
				session_id: 'session456',
				role: 'assistant',
				content: 'Message 2'
			});

			await service.saveMessage({
				user_id: 'user123',
				session_id: 'session789',
				role: 'user',
				content: 'Different session'
			});
		});

		it('should get messages for specific session', async () => {
			const history = await service.getSessionHistory('session456');

			expect(history).toHaveLength(2);
			expect(history[0].session_id).toBe('session456');
			expect(history[1].session_id).toBe('session456');
		});

		it('should return empty array for non-existent session', async () => {
			const history = await service.getSessionHistory('nonexistent');

			expect(history).toHaveLength(0);
		});
	});

	describe('deleteUserHistory', () => {
		beforeEach(async () => {
			await service.saveMessage({
				user_id: 'user123',
				session_id: 'session456',
				role: 'user',
				content: 'Message 1'
			});

			await service.saveMessage({
				user_id: 'user999',
				session_id: 'session789',
				role: 'user',
				content: 'Other user message'
			});
		});

		it('should delete all messages for a user', async () => {
			await service.deleteUserHistory('user123');

			const history = await service.getUserHistory('user123');
			expect(history).toHaveLength(0);
		});

		it('should not affect other users', async () => {
			await service.deleteUserHistory('user123');

			const otherUserHistory = await service.getUserHistory('user999');
			expect(otherUserHistory).toHaveLength(1);
		});
	});
});
