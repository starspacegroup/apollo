import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/sessions - Get all sessions for the authenticated user
export const GET: RequestHandler = async ({ platform, locals }) => {
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

		// Get all sessions for the user
		const sessions = await db
			.prepare(
				`SELECT id, user_id, repository, title, created_at, updated_at, last_message_preview
				FROM chat_sessions
				WHERE user_id = ?
				ORDER BY updated_at DESC
				LIMIT 100`
			)
			.bind(userId)
			.all();

		// Get message counts for each session
		const sessionsWithMessages = await Promise.all(
			sessions.results.map(async (session) => {
				const messageCount = await db
					.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?')
					.bind(session.id)
					.first<{ count: number }>();

				const messages = await db
					.prepare(
						`SELECT role, text, timestamp
						FROM chat_messages
						WHERE session_id = ?
						ORDER BY timestamp ASC`
					)
					.bind(session.id)
					.all();

				return {
					id: session.id,
					repository: session.repository,
					title: session.title,
					messages: messages.results,
					createdAt: session.created_at,
					updatedAt: session.updated_at,
					lastMessagePreview: session.last_message_preview
				};
			})
		);

		return json({ sessions: sessionsWithMessages });
	} catch (err) {
		console.error('Failed to fetch sessions:', err);
		throw error(500, 'Failed to fetch sessions');
	}
};

// POST /api/sessions - Create a new session
export const POST: RequestHandler = async ({ request, platform, locals }) => {
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
		const body = (await request.json()) as {
			id: string;
			repository: string;
			title: string;
			createdAt: number;
			updatedAt: number;
		};
		const { id, repository, title, createdAt, updatedAt } = body;

		if (!id || !repository || !title) {
			throw error(400, 'Missing required fields');
		}

		// First, ensure the user exists in the users table
		await db
			.prepare(
				`INSERT OR REPLACE INTO users (id, username, email, avatar_url, updated_at)
				VALUES (?, ?, ?, ?, unixepoch())`
			)
			.bind(
				userId,
				session.user.username || session.user.name || 'Unknown',
				session.user.email || null,
				session.user.image || null
			)
			.run();

		// Create the session
		await db
			.prepare(
				`INSERT INTO chat_sessions (id, user_id, repository, title, created_at, updated_at, last_message_preview)
				VALUES (?, ?, ?, ?, ?, ?, NULL)`
			)
			.bind(id, userId, repository, title, createdAt, updatedAt)
			.run();

		return json({ success: true, sessionId: id });
	} catch (err) {
		console.error('Failed to create session:', err);
		throw error(500, 'Failed to create session');
	}
};
