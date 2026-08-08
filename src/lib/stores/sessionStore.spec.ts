import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { sessionStore, currentSession, allSessions } from './sessionStore';

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value.toString();
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		}
	};
})();

Object.defineProperty(global, 'localStorage', {
	value: localStorageMock
});

describe('sessionStore', () => {
	beforeEach(() => {
		// Clear localStorage before each test
		localStorage.clear();

		// Delete all sessions to reset the store
		const sessions = get(allSessions);
		sessions.forEach((session) => {
			sessionStore.deleteSession(session.id);
		});

		// Clear current session
		sessionStore.clearCurrentSession();
	});

	it('should create a new session when Chat is clicked', () => {
		const repository = 'test-org/test-repo';

		// Create a new session (simulating clicking "Chat")
		const sessionId = sessionStore.createSession(repository);

		// Session should exist and be current
		const current = get(currentSession);
		expect(current).not.toBeNull();
		expect(current?.id).toBe(sessionId);
		expect(current?.repository).toBe(repository);
		expect(current?.messages).toEqual([]);

		// Empty session should NOT appear in history
		const sessions = get(allSessions);
		expect(sessions.length).toBe(0);
	});

	it('should create multiple sessions for the same repository', () => {
		const repository = 'test-org/test-repo';

		// Create first session
		const session1Id = sessionStore.createSession(repository);

		// Create second session (clicking "Chat" again)
		const session2Id = sessionStore.createSession(repository);

		// Should have two different sessions
		expect(session1Id).not.toBe(session2Id);

		// Empty sessions should NOT appear in history
		const sessions = get(allSessions);
		expect(sessions.length).toBe(0);

		// Current session should be the most recent one
		const current = get(currentSession);
		expect(current?.id).toBe(session2Id);
	});

	it('should add messages to the current session', () => {
		const repository = 'test-org/test-repo';

		// Create a session
		const sessionId = sessionStore.createSession(repository);

		// Add a message
		sessionStore.addMessage({
			role: 'user',
			text: 'Hello, world!',
			timestamp: Date.now()
		});

		// Message should be in the current session
		const current = get(currentSession);
		expect(current?.messages.length).toBe(1);
		expect(current?.messages[0].text).toBe('Hello, world!');
		expect(current?.messages[0].role).toBe('user');
	});

	it('should update session preview when message is added', () => {
		const repository = 'test-org/test-repo';

		// Create a session
		sessionStore.createSession(repository);

		// Add a message
		const longMessage =
			'This is a very long message that should be truncated in the preview to avoid showing too much text in the sidebar';
		sessionStore.addMessage({
			role: 'user',
			text: longMessage,
			timestamp: Date.now()
		});

		// Session should have preview
		const current = get(currentSession);
		expect(current?.lastMessagePreview).toBe(longMessage.slice(0, 100));
	});

	it('should ensure session exists before adding message', () => {
		// This simulates the defensive check in addTranscript
		const repository = 'test-org/test-repo';

		// Initially no session
		expect(get(currentSession)).toBeNull();

		// Create session (simulating the defensive check)
		sessionStore.createSession(repository);

		// Now add message
		sessionStore.addMessage({
			role: 'user',
			text: 'Test message',
			timestamp: Date.now()
		});

		// Message should be added successfully
		const current = get(currentSession);
		expect(current?.messages.length).toBe(1);
	});

	it('should NOT show new empty session in history until first message', () => {
		const repository = 'test-org/test-repo';

		// Create a new session (clicking "Chat")
		const sessionId = sessionStore.createSession(repository);

		// Empty session should NOT appear in history
		let sessions = get(allSessions);
		expect(sessions.length).toBe(0);

		// Session should still be marked as current (even if not in history)
		const current = get(currentSession);
		expect(current?.id).toBe(sessionId);
		expect(current?.messages.length).toBe(0);

		// Add first message
		sessionStore.addMessage({
			role: 'user',
			text: 'First message',
			timestamp: Date.now()
		});

		// NOW session should appear in history
		sessions = get(allSessions);
		expect(sessions.length).toBe(1);
		expect(sessions[0].id).toBe(sessionId);
		expect(sessions[0].messages.length).toBe(1);
	});

	it('should handle multiple sessions - only showing ones with messages in history', () => {
		const repository = 'test-org/test-repo';

		// Create three sessions
		const session1Id = sessionStore.createSession(repository);

		// Add message to first session
		sessionStore.addMessage({
			role: 'user',
			text: 'Message in session 1',
			timestamp: Date.now()
		});

		// Create second session (becomes current, empty)
		const session2Id = sessionStore.createSession(repository);

		// Create third session (becomes current, empty)
		const session3Id = sessionStore.createSession(repository);

		// Only session 1 should appear in history (has message)
		let sessions = get(allSessions);
		expect(sessions.length).toBe(1);
		expect(sessions[0].id).toBe(session1Id);

		// Current session should be session 3
		expect(get(currentSession)?.id).toBe(session3Id);

		// Add message to current session (session 3)
		sessionStore.addMessage({
			role: 'user',
			text: 'Message in session 3',
			timestamp: Date.now()
		});

		// Now both session 1 and 3 should appear in history
		sessions = get(allSessions);
		expect(sessions.length).toBe(2);
		expect(sessions.map((s) => s.id)).toContain(session1Id);
		expect(sessions.map((s) => s.id)).toContain(session3Id);
		expect(sessions.map((s) => s.id)).not.toContain(session2Id); // session 2 still empty
	});
});
