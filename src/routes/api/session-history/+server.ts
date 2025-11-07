import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSessionHistoryService } from '$lib/db/session-history';

/**
 * GET /api/session-history
 * Retrieve session history for the authenticated user
 */
export const GET: RequestHandler = async ({ platform, locals, url }) => {
	try {
		// Check if user is authenticated
		const session = await locals.auth();
		if (!session?.user?.id) {
			throw error(401, 'Authentication required');
		}

		// Get database from platform
		const db = platform?.env?.DB;
		if (!db) {
			throw error(500, 'Database not available');
		}

		// Create service
		const sessionHistoryService = createSessionHistoryService(db);

		// Initialize database if needed
		await sessionHistoryService.initializeDatabase();

		// Get query parameters
		const sessionId = url.searchParams.get('session_id');
		const limit = parseInt(url.searchParams.get('limit') || '100');

		// Fetch history
		let history;
		if (sessionId) {
			history = await sessionHistoryService.getSessionHistory(sessionId);
		} else {
			history = await sessionHistoryService.getUserHistory(session.user.id, limit);
		}

		return json({
			success: true,
			history
		});
	} catch (err) {
		console.error('Error fetching session history:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to fetch session history');
	}
};

/**
 * POST /api/session-history
 * Save a message to session history
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	try {
		// Check if user is authenticated
		const session = await locals.auth();
		if (!session?.user?.id) {
			throw error(401, 'Authentication required');
		}

		// Get database from platform
		const db = platform?.env?.DB;
		if (!db) {
			throw error(500, 'Database not available');
		}

		// Parse request body
		const body = (await request.json()) as {
			session_id: string;
			role: string;
			content: string;
			metadata?: Record<string, any>;
		};
		const { session_id, role, content, metadata } = body;

		// Validate required fields
		if (!session_id || !role || !content) {
			throw error(400, 'Missing required fields: session_id, role, content');
		}

		if (!['user', 'assistant', 'system'].includes(role)) {
			throw error(400, 'Invalid role. Must be user, assistant, or system');
		}

		// Create service
		const sessionHistoryService = createSessionHistoryService(db);

		// Initialize database if needed
		await sessionHistoryService.initializeDatabase();

		// Save message
		await sessionHistoryService.saveMessage({
			user_id: session.user.id,
			session_id,
			role: role as 'user' | 'assistant' | 'system',
			content,
			metadata: metadata ? JSON.stringify(metadata) : undefined
		});

		return json({
			success: true,
			message: 'Message saved successfully'
		});
	} catch (err) {
		console.error('Error saving session history:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to save session history');
	}
};

/**
 * DELETE /api/session-history
 * Delete all session history for the authenticated user
 */
export const DELETE: RequestHandler = async ({ platform, locals }) => {
	try {
		// Check if user is authenticated
		const session = await locals.auth();
		if (!session?.user?.id) {
			throw error(401, 'Authentication required');
		}

		// Get database from platform
		const db = platform?.env?.DB;
		if (!db) {
			throw error(500, 'Database not available');
		}

		// Create service
		const sessionHistoryService = createSessionHistoryService(db);

		// Delete user history
		await sessionHistoryService.deleteUserHistory(session.user.id);

		return json({
			success: true,
			message: 'Session history deleted successfully'
		});
	} catch (err) {
		console.error('Error deleting session history:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to delete session history');
	}
};
