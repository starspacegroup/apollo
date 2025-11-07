/**
 * Database service for session history
 * Handles all database operations for storing and retrieving chat messages
 */

export interface SessionMessage {
	id?: number;
	user_id: string;
	session_id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	created_at?: number;
	metadata?: string;
}

export interface SessionHistoryService {
	saveMessage(message: Omit<SessionMessage, 'id' | 'created_at'>): Promise<void>;
	getUserHistory(userId: string, limit?: number): Promise<SessionMessage[]>;
	getSessionHistory(sessionId: string): Promise<SessionMessage[]>;
	deleteUserHistory(userId: string): Promise<void>;
	initializeDatabase(): Promise<void>;
}

/**
 * Create a session history service instance
 */
export function createSessionHistoryService(db: D1Database): SessionHistoryService {
	return {
		/**
		 * Initialize the database schema
		 * This runs the migration to create tables if they don't exist
		 */
		async initializeDatabase(): Promise<void> {
			const schema = `
				CREATE TABLE IF NOT EXISTS session_history (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id TEXT NOT NULL,
					session_id TEXT NOT NULL,
					role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
					content TEXT NOT NULL,
					created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
					metadata TEXT
				);
				
				CREATE INDEX IF NOT EXISTS idx_user_id ON session_history(user_id);
				CREATE INDEX IF NOT EXISTS idx_session_id ON session_history(session_id);
				CREATE INDEX IF NOT EXISTS idx_created_at ON session_history(created_at);
				CREATE INDEX IF NOT EXISTS idx_user_created ON session_history(user_id, created_at DESC);
			`;

			await db.exec(schema);
		},

		/**
		 * Save a message to the database
		 */
		async saveMessage(message: Omit<SessionMessage, 'id' | 'created_at'>): Promise<void> {
			await db
				.prepare(
					`INSERT INTO session_history (user_id, session_id, role, content, metadata)
					 VALUES (?, ?, ?, ?, ?)`
				)
				.bind(
					message.user_id,
					message.session_id,
					message.role,
					message.content,
					message.metadata || null
				)
				.run();
		},

		/**
		 * Get all messages for a user, optionally limited to most recent N messages
		 * Returns messages in chronological order (oldest first) for display
		 */
		async getUserHistory(userId: string, limit: number = 100): Promise<SessionMessage[]> {
			// Validate and cap limit to prevent performance issues
			const cappedLimit = Math.min(Math.max(1, limit), 1000);

			// Get the most recent N messages, then order them chronologically
			const result = await db
				.prepare(
					`SELECT id, user_id, session_id, role, content, created_at, metadata
					 FROM (
						SELECT id, user_id, session_id, role, content, created_at, metadata
						FROM session_history
						WHERE user_id = ?
						ORDER BY created_at DESC
						LIMIT ?
					 )
					 ORDER BY created_at ASC`
				)
				.bind(userId, cappedLimit)
				.all<SessionMessage>();

			return result.results || [];
		},

		/**
		 * Get all messages for a specific session
		 */
		async getSessionHistory(sessionId: string): Promise<SessionMessage[]> {
			const result = await db
				.prepare(
					`SELECT id, user_id, session_id, role, content, created_at, metadata
					 FROM session_history
					 WHERE session_id = ?
					 ORDER BY created_at ASC`
				)
				.bind(sessionId)
				.all<SessionMessage>();

			return result.results || [];
		},

		/**
		 * Delete all history for a user
		 */
		async deleteUserHistory(userId: string): Promise<void> {
			await db.prepare(`DELETE FROM session_history WHERE user_id = ?`).bind(userId).run();
		}
	};
}
