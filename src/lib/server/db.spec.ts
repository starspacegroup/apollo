/**
 * The session store, against a real database.
 *
 * This replaces `routes/api/sessions/api.test.ts`, which was thirteen
 * `it.skip` cases whose bodies were `expect(true).toBe(true)`. Its comment
 * said real tests would need "a test database, mock authentication, test
 * environment setup". The database ships with Node; authentication is a string
 * these functions take as an argument.
 *
 * The load-bearing cases here are the ownership ones. Every function that
 * touches a session takes a `userId` and is supposed to refuse a session that
 * is not that user's — a session id must not be a capability. Nothing checked
 * that until now.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MemoryD1 } from './d1-memory';
import {
	ensureUser,
	getUserSessions,
	getSession,
	createSession,
	updateSession,
	deleteSession,
	addMessagesToSession
} from './db';
import type { ChatSession } from '$lib/stores/sessionStore';

// The real schema, read from the file that ships. A test against a schema
// retyped into the test file proves the retyping.
const SCHEMA = readFileSync(
	fileURLToPath(new URL('../../../schema.sql', import.meta.url)),
	'utf-8'
);

const ALICE = 'gh-1';
const BOB = 'gh-2';

let db: MemoryD1;
// The functions are typed against D1Database; MemoryD1 implements the subset
// they use. One cast here, at the seam, rather than in every call.
const as = () => db as unknown as Parameters<typeof getUserSessions>[0];

function session(id: string, over: Partial<ChatSession> = {}): ChatSession {
	return {
		id,
		repository: 'davis9001/apollo',
		title: 'A conversation',
		messages: [],
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		...over
	};
}

beforeEach(async () => {
	db = new MemoryD1(SCHEMA);
	await ensureUser(as(), ALICE, 'alice', 'alice@example.invalid', null);
	await ensureUser(as(), BOB, 'bob', null, null);
});

afterEach(() => db.close());

describe('sessions', () => {
	it('creates one and reads it back', async () => {
		await createSession(as(), session('s1'), ALICE);
		const back = await getSession(as(), 's1', ALICE);
		expect(back?.id).toBe('s1');
		expect(back?.repository).toBe('davis9001/apollo');
		expect(back?.messages).toEqual([]);
	});

	it('lists only the asking user’s sessions', async () => {
		await createSession(as(), session('mine'), ALICE);
		await createSession(as(), session('theirs'), BOB);

		const mine = await getUserSessions(as(), ALICE);
		expect(mine.map((s) => s.id)).toEqual(['mine']);
	});

	it('orders the list by most recently updated', async () => {
		await createSession(as(), session('older', { updatedAt: 1 }), ALICE);
		await createSession(as(), session('newer', { updatedAt: 2 }), ALICE);
		const ids = (await getUserSessions(as(), ALICE)).map((s) => s.id);
		expect(ids).toEqual(['newer', 'older']);
	});

	it('keeps messages in timestamp order, not insertion order', async () => {
		await createSession(as(), session('s1'), ALICE);
		await addMessagesToSession(as(), 's1', ALICE, [
			{ role: 'user', text: 'second', timestamp: 200 },
			{ role: 'user', text: 'first', timestamp: 100 }
		]);
		const back = await getSession(as(), 's1', ALICE);
		expect(back?.messages.map((m) => m.text)).toEqual(['first', 'second']);
	});

	it('writes a preview from the last message', async () => {
		await createSession(as(), session('s1'), ALICE);
		await addMessagesToSession(as(), 's1', ALICE, [
			{ role: 'user', text: 'hello', timestamp: 1 },
			{ role: 'assistant', text: 'a'.repeat(200), timestamp: 2 }
		]);
		const back = await getSession(as(), 's1', ALICE);
		expect(back?.lastMessagePreview).toHaveLength(100);
	});

	it('deletes a session and its messages with it', async () => {
		await createSession(as(), session('s1'), ALICE);
		await addMessagesToSession(as(), 's1', ALICE, [{ role: 'user', text: 'hello', timestamp: 1 }]);

		expect(await deleteSession(as(), 's1', ALICE)).toBe(true);
		expect(await getSession(as(), 's1', ALICE)).toBeNull();

		const orphans = await db
			.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?')
			.bind('s1')
			.first<{ n: number }>();
		expect(orphans?.n).toBe(0);
	});
});

/**
 * A session id is not a capability. Knowing one gets you nothing if the
 * session is not yours — read, write, delete and append alike.
 */
describe('ownership', () => {
	beforeEach(async () => {
		await createSession(as(), session('alices'), ALICE);
	});

	it('will not read another user’s session', async () => {
		expect(await getSession(as(), 'alices', BOB)).toBeNull();
	});

	it('will not delete another user’s session', async () => {
		expect(await deleteSession(as(), 'alices', BOB)).toBe(false);
		expect(await getSession(as(), 'alices', ALICE)).not.toBeNull();
	});

	it('will not append to another user’s session', async () => {
		const added = await addMessagesToSession(as(), 'alices', BOB, [
			{ role: 'user', text: 'not mine', timestamp: 1 }
		]);
		expect(added).toBe(false);

		const back = await getSession(as(), 'alices', ALICE);
		expect(back?.messages).toEqual([]);
	});

	it('will not retitle another user’s session', async () => {
		await updateSession(as(), 'alices', BOB, { title: 'taken' });
		const back = await getSession(as(), 'alices', ALICE);
		expect(back?.title).toBe('A conversation');
	});

	it('reports a missing session the same as a forbidden one', async () => {
		// Same answer either way, so the API cannot be used to discover which
		// session ids exist.
		expect(await getSession(as(), 'no-such-session', ALICE)).toBeNull();
		expect(await getSession(as(), 'alices', BOB)).toBeNull();
		expect(await deleteSession(as(), 'no-such-session', ALICE)).toBe(false);
		expect(await deleteSession(as(), 'alices', BOB)).toBe(false);
	});
});
