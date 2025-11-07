import { writable, derived, get } from 'svelte/store';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
}

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
    createSession: (repository: string, title?: string) => {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    getOrCreateSessionForRepo: (repository: string) => {
      const state = get({ subscribe });

      // Check if current session is for this repo
      if (state.currentSessionId) {
        const currentSession = state.sessions.find((s) => s.id === state.currentSessionId);
        if (currentSession && currentSession.repository === repository) {
          return state.currentSessionId;
        }
      }

      // Create new session for this repo
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

      return sessionId;
    },

    // Get sessions for a specific repository
    getSessionsForRepo: (repository: string) => {
      const state = get({ subscribe });
      return state.sessions.filter((s) => s.repository === repository);
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
