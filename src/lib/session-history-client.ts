/**
 * Session history client-side helper
 * Manages saving and loading chat session history
 */

export interface Message {
	role: 'user' | 'assistant' | 'system';
	text: string;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
	return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save a message to session history
 */
export async function saveMessage(
	sessionId: string,
	role: 'user' | 'assistant' | 'system',
	content: string,
	metadata?: Record<string, any>
): Promise<void> {
	try {
		const response = await fetch('/api/session-history', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				session_id: sessionId,
				role,
				content,
				metadata
			})
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.message || 'Failed to save message');
		}
	} catch (err) {
		console.error('Error saving message to history:', err);
		// Don't throw - we don't want to break the chat if history saving fails
	}
}

/**
 * Load session history for the current user
 */
export async function loadUserHistory(limit: number = 100): Promise<Message[]> {
	try {
		const response = await fetch(`/api/session-history?limit=${limit}`);

		if (!response.ok) {
			if (response.status === 401) {
				// User not authenticated
				return [];
			}
			throw new Error('Failed to load session history');
		}

		const data = await response.json();
		if (data.success && Array.isArray(data.history)) {
			// Convert database format to component format
			return data.history.map((msg: any) => ({
				role: msg.role,
				text: msg.content
			}));
		}

		return [];
	} catch (err) {
		console.error('Error loading session history:', err);
		return [];
	}
}

/**
 * Load history for a specific session
 */
export async function loadSessionHistory(sessionId: string): Promise<Message[]> {
	try {
		const response = await fetch(`/api/session-history?session_id=${sessionId}`);

		if (!response.ok) {
			throw new Error('Failed to load session history');
		}

		const data = await response.json();
		if (data.success && Array.isArray(data.history)) {
			return data.history.map((msg: any) => ({
				role: msg.role,
				text: msg.content
			}));
		}

		return [];
	} catch (err) {
		console.error('Error loading session history:', err);
		return [];
	}
}

/**
 * Delete all session history for the current user
 */
export async function deleteUserHistory(): Promise<boolean> {
	try {
		const response = await fetch('/api/session-history', {
			method: 'DELETE'
		});

		if (!response.ok) {
			throw new Error('Failed to delete session history');
		}

		const data = await response.json();
		return data.success;
	} catch (err) {
		console.error('Error deleting session history:', err);
		return false;
	}
}
