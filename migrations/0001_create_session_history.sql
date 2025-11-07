-- Migration: Create session history table
-- Description: Store chat session history for users across devices

-- Session History Table
-- Stores all chat messages for authenticated users
CREATE TABLE IF NOT EXISTS session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    metadata TEXT -- JSON field for additional data (e.g., repository context)
);

-- Index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_user_id ON session_history(user_id);

-- Index for session-based queries
CREATE INDEX IF NOT EXISTS idx_session_id ON session_history(session_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_created_at ON session_history(created_at);

-- Composite index for user's recent messages
CREATE INDEX IF NOT EXISTS idx_user_created ON session_history(user_id, created_at DESC);
