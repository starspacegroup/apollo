import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	text: string;
	timestamp: number;
}

// Track if we're currently syncing to prevent loops
let isSyncing = false;

export interface ChatSession {
	id: string;
	repository: string;
	title: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
	lastMessagePreview?: string;
}

interface SessionState {
	currentSessionId: string | null;
	sessions: ChatSession[];
}

const STORAGE_KEY = 'apollo_chat_sessions';
const MAX_SESSIONS = 100; // Limit stored sessions

// Load sessions from localStorage
function loadSessions(): SessionState {
	if (typeof window === 'undefined') {
		return { currentSessionId: null, sessions: [] };
	}

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const data = JSON.parse(stored);
			return {
				currentSessionId: data.currentSessionId || null,
				sessions: data.sessions || []
			};
		}
	} catch (error) {
		console.error('Failed to load sessions from localStorage:', error);
	}

	return { currentSessionId: null, sessions: [] };
}

// Save sessions to localStorage
function saveSessions(state: SessionState) {
	if (typeof window === 'undefined') return;

	try {
		// Keep only the most recent sessions
		const sessionsToSave = [...state.sessions]
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, MAX_SESSIONS);

		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				currentSessionId: state.currentSessionId,
				sessions: sessionsToSave
			})
		);
	} catch (error) {
		console.error('Failed to save sessions to localStorage:', error);
	}
}

// Create the store
function createSessionStore() {
	const initialState = loadSessions();
	const { subscribe, set, update } = writable<SessionState>(initialState);

	// Auto-save on changes
	subscribe((state) => {
		saveSessions(state);
	});

	return {
		subscribe,

		// Create a new session
		createSession: (repository: string, title?: string, skipNavigation = false) => {
			// Use crypto.randomUUID() for secure random ID generation
			const sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`;
			const now = Date.now();

			const newSession: ChatSession = {
				id: sessionId,
				repository,
				title: title || `${repository.split('/').pop()} - ${new Date().toLocaleDateString()}`,
				messages: [],
				createdAt: now,
				updatedAt: now,
				lastMessagePreview: undefined
			};

			update((state) => ({
				currentSessionId: sessionId,
				sessions: [newSession, ...state.sessions]
			}));

			// Only navigate if not skipped (to prevent navigation during active operations)
			if (browser && !skipNavigation) {
				const targetPath = `/c/${sessionId}`;
				if (window.location.pathname !== targetPath) {
					goto(targetPath);
				}
			}

			return sessionId;
		},

		// Switch to an existing session
		switchSession: (sessionId: string) => {
			update((state) => {
				const sessionExists = state.sessions.some((s) => s.id === sessionId);
				if (!sessionExists) {
					console.warn(`Session ${sessionId} not found`);
					return state;
				}
				return {
					...state,
					currentSessionId: sessionId
				};
			});

			// Navigate to the session URL if not already there
			if (browser && !window.location.pathname.includes(`/c/${sessionId}`)) {
				goto(`/c/${sessionId}`);
			}
		},

		// Add a message to the current session
		addMessage: (message: ChatMessage) => {
			update((state) => {
				if (!state.currentSessionId) {
					console.warn('No active session to add message to');
					return state;
				}

				const sessions = state.sessions.map((session) => {
					if (session.id === state.currentSessionId) {
						const updatedMessages = [...session.messages, message];

						return {
							...session,
							messages: updatedMessages,
							updatedAt: Date.now(),
							lastMessagePreview:
								message.role === 'user' || message.role === 'assistant'
									? message.text.slice(0, 100)
									: session.lastMessagePreview
						};
					}
					return session;
				});

				return {
					...state,
					sessions
				};
			});
		},

		// Update the last message in the current session (for streaming)
		updateLastMessage: (text: string) => {
			update((state) => {
				if (!state.currentSessionId) return state;

				const sessions = state.sessions.map((session) => {
					if (session.id === state.currentSessionId && session.messages.length > 0) {
						const messages = [...session.messages];
						const lastMessage = messages[messages.length - 1];
						messages[messages.length - 1] = {
							...lastMessage,
							text: lastMessage.text + text
						};

						return {
							...session,
							messages,
							updatedAt: Date.now(),
							lastMessagePreview: messages[messages.length - 1].text.slice(0, 100)
						};
					}
					return session;
				});

				return {
					...state,
					sessions
				};
			});
		},

		// Replace the last message with new text (for transcript updates)
		replaceLastMessage: (text: string) => {
			update((state) => {
				if (!state.currentSessionId) return state;

				const sessions = state.sessions.map((session) => {
					if (session.id === state.currentSessionId && session.messages.length > 0) {
						const messages = [...session.messages];
						const lastMessage = messages[messages.length - 1];
						messages[messages.length - 1] = {
							...lastMessage,
							text: text
						};

						return {
							...session,
							messages,
							updatedAt: Date.now(),
							lastMessagePreview: text.slice(0, 100)
						};
					}
					return session;
				});

				return {
					...state,
					sessions
				};
			});
		},

		// Load messages for the current session
		loadCurrentSession: () => {
			const state = get({ subscribe });
			if (!state.currentSessionId) return [];

			const session = state.sessions.find((s) => s.id === state.currentSessionId);
			return session ? session.messages : [];
		},

		// Get the current session
		getCurrentSession: () => {
			const state = get({ subscribe });
			if (!state.currentSessionId) return null;

			return state.sessions.find((s) => s.id === state.currentSessionId) || null;
		},

		// Delete a session
		deleteSession: (sessionId: string) => {
			update((state) => {
				const sessions = state.sessions.filter((s) => s.id !== sessionId);
				const currentSessionId =
					state.currentSessionId === sessionId ? null : state.currentSessionId;

				return {
					currentSessionId,
					sessions
				};
			});

			// Also delete from database (async, don't wait)
			if (browser) {
				fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }).catch((err) =>
					console.error('Failed to delete session from database:', err)
				);
			}
		},

		// Clear current session (deselect)
		clearCurrentSession: () => {
			update((state) => ({
				...state,
				currentSessionId: null
			}));
		},

		// Update session title
		updateSessionTitle: (sessionId: string, title: string) => {
			update((state) => {
				const sessions = state.sessions.map((session) =>
					session.id === sessionId ? { ...session, title, updatedAt: Date.now() } : session
				);

				return {
					...state,
					sessions
				};
			});
		},

		// Find or create session for repository
		getOrCreateSessionForRepo: (repository: string, skipNavigation = false) => {
			const state = get({ subscribe });

			// Check if current session is for this repo
			if (state.currentSessionId) {
				const currentSession = state.sessions.find((s) => s.id === state.currentSessionId);
				if (currentSession && currentSession.repository === repository) {
					return state.currentSessionId;
				}
			}

			// Create new session for this repo
			// Use crypto.randomUUID() for secure random ID generation
			const sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`;
			const now = Date.now();

			const newSession: ChatSession = {
				id: sessionId,
				repository,
				title: `${repository.split('/').pop()} - ${new Date().toLocaleDateString()}`,
				messages: [],
				createdAt: now,
				updatedAt: now,
				lastMessagePreview: undefined
			};

			update((currentState) => ({
				currentSessionId: sessionId,
				sessions: [newSession, ...currentState.sessions]
			}));

			// Only navigate if not skipped (to prevent navigation during active operations)
			if (browser && !skipNavigation) {
				const targetPath = `/c/${sessionId}`;
				if (window.location.pathname !== targetPath) {
					goto(targetPath);
				}
			}

			return sessionId;
		},

		// Get sessions for a specific repository
		getSessionsForRepo: (repository: string) => {
			const state = get({ subscribe });
			return state.sessions.filter((s) => s.repository === repository);
		},

		// Sync sessions from database
		syncFromDatabase: async () => {
			if (!browser || isSyncing) return;

			isSyncing = true;
			try {
				const response = await fetch('/api/sessions');
				if (response.ok) {
					const data = (await response.json()) as { sessions: ChatSession[] };
					const sessions = data.sessions || [];

					// Update store with database sessions
					update((state) => ({
						...state,
						sessions: sessions
					}));
				}
			} catch (error) {
				console.error('Failed to sync sessions from database:', error);
			} finally {
				isSyncing = false;
			}
		},

		// Sync a session to database
		syncSessionToDatabase: async (sessionId: string) => {
			if (!browser || isSyncing) return;

			const state = get({ subscribe });
			const session = state.sessions.find((s) => s.id === sessionId);

			if (!session) return;

			try {
				// Check if session exists in database
				const getResponse = await fetch(`/api/sessions/${sessionId}`);

				if (getResponse.ok) {
					// Update existing session
					await fetch(`/api/sessions/${sessionId}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							title: session.title,
							updatedAt: session.updatedAt,
							lastMessagePreview: session.lastMessagePreview
						})
					});

					// Sync messages if needed
					const dbSession = (await getResponse.json()) as ChatSession;
					if (session.messages.length > dbSession.messages.length) {
						const newMessages = session.messages.slice(dbSession.messages.length);
						await fetch(`/api/sessions/${sessionId}/messages`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ messages: newMessages })
						});
					}
				} else if (getResponse.status === 404) {
					// Create new session
					await fetch('/api/sessions', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							id: session.id,
							repository: session.repository,
							title: session.title,
							createdAt: session.createdAt,
							updatedAt: session.updatedAt
						})
					});

					// Add messages if any
					if (session.messages.length > 0) {
						await fetch(`/api/sessions/${sessionId}/messages`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ messages: session.messages })
						});
					}
				}
			} catch (error) {
				console.error('Failed to sync session to database:', error);
			}
		},

		// Delete a session from database
		deleteSessionFromDatabase: async (sessionId: string) => {
			if (!browser) return;

			try {
				await fetch(`/api/sessions/${sessionId}`, {
					method: 'DELETE'
				});
			} catch (error) {
				console.error('Failed to delete session from database:', error);
			}
		}
	};
}

export const sessionStore = createSessionStore();

// Derived stores for convenient access
export const currentSession = derived(sessionStore, ($sessionStore) => {
	if (!$sessionStore.currentSessionId) return null;
	return $sessionStore.sessions.find((s) => s.id === $sessionStore.currentSessionId) || null;
});

export const allSessions = derived(sessionStore, ($sessionStore) => {
	// Filter out sessions with no messages (don't show empty sessions in history)
	return [...$sessionStore.sessions]
		.filter((s) => s.messages.length > 0)
		.sort((a, b) => b.updatedAt - a.updatedAt);
});

export const currentSessionMessages = derived(currentSession, ($currentSession) => {
	return $currentSession ? $currentSession.messages : [];
});
