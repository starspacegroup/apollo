/**
 * Database helper functions for session management
 */

import type { ChatMessage, ChatSession } from '$lib/stores/sessionStore';

export interface DbChatSession {
	id: string;
	user_id: string;
	repository: string;
	title: string;
	created_at: number;
	updated_at: number;
	last_message_preview: string | null;
}

export interface DbChatMessage {
	id: number;
	session_id: string;
	role: string;
	text: string;
	timestamp: number;
}

/**
 * Ensure user exists in the database
 */
export async function ensureUser(
	db: D1Database,
	userId: string,
	username: string,
	email: string | null,
	avatarUrl: string | null
): Promise<void> {
	await db
		.prepare(
			`INSERT OR REPLACE INTO users (id, username, email, avatar_url, updated_at)
			VALUES (?, ?, ?, ?, unixepoch())`
		)
		.bind(userId, username, email, avatarUrl)
		.run();
}

/**
 * Get all sessions for a user
 */
export async function getUserSessions(db: D1Database, userId: string): Promise<ChatSession[]> {
	const sessions = await db
		.prepare(
			`SELECT id, user_id, repository, title, created_at, updated_at, last_message_preview
			FROM chat_sessions
			WHERE user_id = ?
			ORDER BY updated_at DESC
			LIMIT 100`
		)
		.bind(userId)
		.all<DbChatSession>();

	// Get messages for each session
	const sessionsWithMessages = await Promise.all(
		sessions.results.map(async (session) => {
			const messages = await db
				.prepare(
					`SELECT role, text, timestamp
					FROM chat_messages
					WHERE session_id = ?
					ORDER BY timestamp ASC`
				)
				.bind(session.id)
				.all<DbChatMessage>();

			return {
				id: session.id,
				repository: session.repository,
				title: session.title,
				messages: messages.results.map(
					(msg): ChatMessage => ({
						role: msg.role as 'user' | 'assistant' | 'system',
						text: msg.text,
						timestamp: msg.timestamp
					})
				),
				createdAt: session.created_at,
				updatedAt: session.updated_at,
				lastMessagePreview: session.last_message_preview || undefined
			};
		})
	);

	return sessionsWithMessages;
}

/**
 * Get a specific session
 */
export async function getSession(
	db: D1Database,
	sessionId: string,
	userId: string
): Promise<ChatSession | null> {
	const sessionData = await db
		.prepare(
			`SELECT id, user_id, repository, title, created_at, updated_at, last_message_preview
			FROM chat_sessions
			WHERE id = ? AND user_id = ?`
		)
		.bind(sessionId, userId)
		.first<DbChatSession>();

	if (!sessionData) {
		return null;
	}

	const messages = await db
		.prepare(
			`SELECT role, text, timestamp
			FROM chat_messages
			WHERE session_id = ?
			ORDER BY timestamp ASC`
		)
		.bind(sessionId)
		.all<DbChatMessage>();

	return {
		id: sessionData.id,
		repository: sessionData.repository,
		title: sessionData.title,
		messages: messages.results.map(
			(msg): ChatMessage => ({
				role: msg.role as 'user' | 'assistant' | 'system',
				text: msg.text,
				timestamp: msg.timestamp
			})
		),
		createdAt: sessionData.created_at,
		updatedAt: sessionData.updated_at,
		lastMessagePreview: sessionData.last_message_preview || undefined
	};
}

/**
 * Create a new session
 */
export async function createSession(
	db: D1Database,
	session: ChatSession,
	userId: string
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO chat_sessions (id, user_id, repository, title, created_at, updated_at, last_message_preview)
			VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			session.id,
			userId,
			session.repository,
			session.title,
			session.createdAt,
			session.updatedAt,
			session.lastMessagePreview || null
		)
		.run();
}

/**
 * Update a session
 */
export async function updateSession(
	db: D1Database,
	sessionId: string,
	userId: string,
	updates: {
		title?: string;
		updatedAt?: number;
		lastMessagePreview?: string;
	}
): Promise<boolean> {
	// Verify session belongs to user
	const sessionData = await db
		.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?')
		.bind(sessionId, userId)
		.first();

	if (!sessionData) {
		return false;
	}

	await db
		.prepare(
			`UPDATE chat_sessions
			SET title = COALESCE(?, title),
				updated_at = COALESCE(?, updated_at),
				last_message_preview = COALESCE(?, last_message_preview)
			WHERE id = ? AND user_id = ?`
		)
		.bind(
			updates.title || null,
			updates.updatedAt || null,
			updates.lastMessagePreview || null,
			sessionId,
			userId
		)
		.run();

	return true;
}

/**
 * Delete a session
 */
export async function deleteSession(
	db: D1Database,
	sessionId: string,
	userId: string
): Promise<boolean> {
	// Verify session belongs to user
	const sessionData = await db
		.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?')
		.bind(sessionId, userId)
		.first();

	if (!sessionData) {
		return false;
	}

	// Delete messages first
	await db.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(sessionId).run();

	// Delete the session
	await db
		.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?')
		.bind(sessionId, userId)
		.run();

	return true;
}

/**
 * Add messages to a session
 */
export async function addMessagesToSession(
	db: D1Database,
	sessionId: string,
	userId: string,
	messages: ChatMessage[]
): Promise<boolean> {
	// Verify session belongs to user
	const sessionData = await db
		.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?')
		.bind(sessionId, userId)
		.first();

	if (!sessionData) {
		return false;
	}

	// Insert all messages
	for (const message of messages) {
		await db
			.prepare(
				`INSERT INTO chat_messages (session_id, role, text, timestamp)
				VALUES (?, ?, ?, ?)`
			)
			.bind(sessionId, message.role, message.text, message.timestamp)
			.run();
	}

	// Update session's last_message_preview and updated_at
	const lastMessage = messages[messages.length - 1];
	if (lastMessage && (lastMessage.role === 'user' || lastMessage.role === 'assistant')) {
		await db
			.prepare(
				`UPDATE chat_sessions
				SET last_message_preview = ?,
					updated_at = ?
				WHERE id = ? AND user_id = ?`
			)
			.bind(lastMessage.text.slice(0, 100), Date.now(), sessionId, userId)
			.run();
	}

	return true;
}
