import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST /api/sessions/[sessionId]/messages - Add messages to a session
export const POST: RequestHandler = async ({ params, request, platform, locals }) => {
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
		const body = await request.json();
		const { messages } = body;

		if (!Array.isArray(messages) || messages.length === 0) {
			throw error(400, 'Invalid messages array');
		}

		// Verify session belongs to user
		const sessionData = await db
			.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?')
			.bind(sessionId, userId)
			.first();

		if (!sessionData) {
			throw error(404, 'Session not found');
		}

		// Insert all messages
		for (const message of messages) {
			const { role, text, timestamp } = message;

			if (!role || !text || !timestamp) {
				continue; // Skip invalid messages
			}

			await db
				.prepare(
					`INSERT INTO chat_messages (session_id, role, text, timestamp)
VALUES (?, ?, ?, ?)`
				)
				.bind(sessionId, role, text, timestamp)
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

		return json({ success: true, count: messages.length });
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('Failed to add messages:', err);
		throw error(500, 'Failed to add messages');
	}
};
