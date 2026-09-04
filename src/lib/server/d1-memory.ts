/**
 * A real SQLite database wearing D1's interface, for tests.
 *
 * The session API had a test file of thirteen `it.skip` cases whose bodies
 * were `expect(true).toBe(true)`. It asserted nothing, and a green suite said
 * the session API worked when nothing had ever exercised it. The reason given
 * was that testing it "would need a test database" — which Node has had built
 * in since 22.13. `node:sqlite` is not a dependency; it ships with the runtime.
 *
 * This is deliberately thin. It implements exactly the surface `db.ts` and the
 * session endpoints use — `prepare().bind().run()/all()/first()` and `exec` —
 * against a real engine, so the tests run the real SQL against the real schema
 * with real foreign keys. A hand-written fake that pattern-matched query
 * strings would pass whatever the queries happened to say, which is the same
 * nothing the skipped tests asserted.
 */
import { DatabaseSync } from 'node:sqlite';

/** The subset of D1 the app touches. */
export interface D1Like {
	prepare(sql: string): D1StatementLike;
	exec(sql: string): Promise<unknown>;
}

export interface D1StatementLike {
	bind(...values: unknown[]): D1StatementLike;
	run(): Promise<{ success: true }>;
	all<T = unknown>(): Promise<{ results: T[] }>;
	first<T = unknown>(): Promise<T | null>;
}

class Statement implements D1StatementLike {
	constructor(
		private db: DatabaseSync,
		private sql: string,
		private values: unknown[] = []
	) {}

	bind(...values: unknown[]): Statement {
		return new Statement(this.db, this.sql, values);
	}

	// `node:sqlite` takes null, number, bigint, string and Uint8Array. D1
	// accepts `undefined` where a column is nullable, so it maps to null here
	// rather than throwing somewhere less obvious.
	private args() {
		return this.values.map((v) => (v === undefined ? null : v)) as never[];
	}

	async run() {
		this.db.prepare(this.sql).run(...this.args());
		return { success: true as const };
	}

	async all<T>() {
		return { results: this.db.prepare(this.sql).all(...this.args()) as T[] };
	}

	async first<T>() {
		const row = this.db.prepare(this.sql).get(...this.args());
		return (row ?? null) as T | null;
	}
}

export class MemoryD1 implements D1Like {
	private db = new DatabaseSync(':memory:');

	constructor(schema?: string) {
		// Off by default in SQLite, and the schema leans on them: deleting a
		// session must take its messages with it. Without this the cascade
		// tests would pass by doing nothing.
		this.db.exec('PRAGMA foreign_keys = ON');
		if (schema) this.db.exec(schema);
	}

	prepare(sql: string) {
		return new Statement(this.db, sql);
	}

	async exec(sql: string) {
		this.db.exec(sql);
		return {};
	}

	close() {
		this.db.close();
	}
}
