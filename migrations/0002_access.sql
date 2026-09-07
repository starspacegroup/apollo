-- Who may see what, and how much they may do about it (2026-09-07).
--
-- A member is anyone who has signed in. A grant is one member's level on one
-- project — or on every project, as '*'. The owner needs no grants; an admin
-- needs none either; a guest has exactly the grants they were given.

CREATE TABLE IF NOT EXISTS members (
    id         TEXT PRIMARY KEY,               -- '<provider>:<id>', e.g. 'discord:1234'
    name       TEXT NOT NULL,
    avatar     TEXT,
    role       TEXT NOT NULL DEFAULT 'guest',  -- owner | admin | guest
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS grants (
    member     TEXT NOT NULL,
    project    TEXT NOT NULL,                  -- a project's name, or '*'
    level      TEXT NOT NULL,                  -- view | member | manager
    granted_by TEXT NOT NULL,
    granted_at INTEGER NOT NULL,
    PRIMARY KEY (member, project)
);
