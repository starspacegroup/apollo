import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/sessions/[sessionId] - Get a specific session
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const userId = session.user.id;
		const { sessionId } = params;

		// Get the session (ensuring it belongs to the user)
		const sessionData = await db
			.prepare(
				`SELECT id, user_id, repository, title, created_at, updated_at, last_message_preview
FROM chat_sessions
WHERE id = ? AND user_id = ?`
			)
			.bind(sessionId, userId)
			.first();

		if (!sessionData) {
			throw error(404, 'Session not found');
		}

		// Get messages for the session
		const messages = await db
			.prepare(
				`SELECT role, text, timestamp
FROM chat_messages
WHERE session_id = ?
ORDER BY timestamp ASC`
			)
			.bind(sessionId)
			.all();

		return json({
			id: sessionData.id,
			repository: sessionData.repository,
			title: sessionData.title,
			messages: messages.results,
			createdAt: sessionData.created_at,
			updatedAt: sessionData.updated_at,
			lastMessagePreview: sessionData.last_message_preview
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('Failed to fetch session:', err);
		throw error(500, 'Failed to fetch session');
	}
};

// PUT /api/sessions/[sessionId] - Update a session
export const PUT: RequestHandler = async ({ params, request, platform, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const userId = session.user.id;
		const { sessionId } = params;
		const body = (await request.json()) as {
			title?: string;
			updatedAt?: number;
			lastMessagePreview?: string;
		};
		const { title, updatedAt, lastMessagePreview } = body;

		// Verify session belongs to user
		const sessionData = await db
			.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?')
			.bind(sessionId, userId)
			.first();

		if (!sessionData) {
			throw error(404, 'Session not found');
		}

		// Update the session
		await db
			.prepare(
				`UPDATE chat_sessions
SET title = COALESCE(?, title),
updated_at = COALESCE(?, updated_at),
last_message_preview = COALESCE(?, last_message_preview)
WHERE id = ? AND user_id = ?`
			)
			.bind(title || null, updatedAt || null, lastMessagePreview || null, sessionId, userId)
			.run();

		return json({ success: true });
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('Failed to update session:', err);
		throw error(500, 'Failed to update session');
	}
};

// DELETE /api/sessions/[sessionId] - Delete a session
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		throw error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const userId = session.user.id;
		const { sessionId } = params;

		// Verify session belongs to user
		const sessionData = await db
			.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?')
			.bind(sessionId, userId)
			.first();

		if (!sessionData) {
			throw error(404, 'Session not found');
		}

		// Delete messages first (cascade should handle this, but being explicit)
		await db.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(sessionId).run();

		// Delete the session
		await db
			.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?')
			.bind(sessionId, userId)
			.run();

		return json({ success: true });
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('Failed to delete session:', err);
		throw error(500, 'Failed to delete session');
	}
};
