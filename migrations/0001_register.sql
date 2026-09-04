-- The write half.
--
-- plans/state-layer.md §4 draws the line this schema must not cross:
--
--   GitHub owns work. Apollo owns actors and runs.
--
-- So there is no issue table here, no title, no body, no comment. Work is
-- referred to by `owner/repo#number` and by nothing else. If a column ever
-- appears in this file that holds the *content* of a piece of work, Apollo has
-- become a mirror of GitHub with a sync bug, which is the failure the whole
-- plan exists to avoid.
--
-- What is here is the half GitHub cannot hold: what the machine said about
-- itself, and what somebody asked it to do.

-- The last snapshot the local half pushed, kept for history.
--
-- KV holds the current one for the hot read; this is the trail. A board that
-- can only show *now* cannot answer "when did that project go quiet", which is
-- the question a person actually asks after a week away.
CREATE TABLE IF NOT EXISTS snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    machine      TEXT NOT NULL,
    generated_at INTEGER NOT NULL,
    received_at  INTEGER NOT NULL,
    -- Counts, so a trend is one query rather than a JSON parse per row.
    projects     INTEGER NOT NULL DEFAULT 0,
    actors       INTEGER NOT NULL DEFAULT 0,
    running      INTEGER NOT NULL DEFAULT 0,
    attention    INTEGER NOT NULL DEFAULT 0,
    autonomy     TEXT,
    gate_ok      INTEGER NOT NULL DEFAULT 0,
    body         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_recent ON snapshots(received_at DESC);

-- What somebody asked the machine to do.
--
-- plans/dirac-bridge.md §4: Apollo may request work. It may never authorise it.
-- Nothing in this table is a command. The daemon pulls these, and the conductor
-- puts each one through the same ladder a cadence trigger goes through, under
-- David's autonomy dial, on his machine. An intent this Worker has accepted is
-- a question that has been asked, not a thing that will happen.
CREATE TABLE IF NOT EXISTS intents (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    -- Free-form payload for the kind. Never a command, never a script.
    payload     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    created_by  TEXT NOT NULL,
    -- pending | delivered | applied | refused | expired
    state       TEXT NOT NULL DEFAULT 'pending',
    delivered_at INTEGER,
    settled_at  INTEGER,
    -- What the machine said back. The honest half of "moving a card": the card
    -- moves when the machine says it moved, not when the browser asks.
    detail      TEXT
);
CREATE INDEX IF NOT EXISTS intents_pending ON intents(state, created_at);
