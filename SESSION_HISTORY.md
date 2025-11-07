# Session History Feature

## Overview

Apollo now stores your chat session history in a database, providing a seamless experience across all devices when you're logged in with your GitHub account.

## How It Works

### Database Storage

- **Database**: Cloudflare D1 (SQLite-based)
- **Security**: All session history is tied to your GitHub user ID
- **Privacy**: Only you can access your own session history

### What Gets Stored

Each message in your conversation is stored with:
- **User ID**: Your GitHub user ID (from OAuth)
- **Session ID**: A unique identifier for each conversation session
- **Role**: Whether the message is from you (`user`), the AI (`assistant`), or the system (`system`)
- **Content**: The actual message text
- **Timestamp**: When the message was created
- **Metadata**: Optional contextual information (e.g., which repository you were discussing)

### Cross-Device Consistency

When you log in with GitHub:
1. Your previous conversations are automatically loaded
2. New messages are saved to the database in real-time
3. Your conversation history is available on any device where you log in

## API Endpoints

### GET /api/session-history

Retrieve session history for the authenticated user.

**Query Parameters:**
- `session_id` (optional): Get messages for a specific session
- `limit` (optional): Maximum number of messages to return (default: 100)

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "id": 1,
      "user_id": "12345",
      "session_id": "session_1699...",
      "role": "user",
      "content": "Hello, how can I create a GitHub issue?",
      "created_at": 1699360000,
      "metadata": "{\"repository\":\"owner/repo\"}"
    }
  ]
}
```

### POST /api/session-history

Save a message to session history.

**Request Body:**
```json
{
  "session_id": "session_1699...",
  "role": "user",
  "content": "Hello, how can I create a GitHub issue?",
  "metadata": {
    "repository": "owner/repo"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message saved successfully"
}
```

### DELETE /api/session-history

Delete all session history for the authenticated user.

**Response:**
```json
{
  "success": true,
  "message": "Session history deleted successfully"
}
```

## Database Schema

```sql
CREATE TABLE session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    metadata TEXT
);

-- Indexes for performance
CREATE INDEX idx_user_id ON session_history(user_id);
CREATE INDEX idx_session_id ON session_history(session_id);
CREATE INDEX idx_created_at ON session_history(created_at);
CREATE INDEX idx_user_created ON session_history(user_id, created_at DESC);
```

## Setup Instructions

### Development Environment

1. **Database Setup**: The database is automatically created in local development mode when you start the dev server.

2. **Environment Variables**: No additional environment variables are needed. The database binding is configured in `wrangler.jsonc`.

3. **Database Initialization**: The database schema is automatically initialized on first use.

### Production Deployment

1. **Create D1 Database**:
   ```bash
   npx wrangler d1 create apollo-session-db
   ```

2. **Update wrangler.jsonc**: Replace the `database_id` in `wrangler.jsonc` with the ID returned from the create command:
   ```jsonc
   {
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "apollo-session-db",
         "database_id": "your-database-id-here"
       }
     ]
   }
   ```

3. **Run Migrations** (if needed):
   ```bash
   npx wrangler d1 execute apollo-session-db --file=./migrations/0001_create_session_history.sql
   ```

4. **Deploy**:
   ```bash
   npm run deploy
   ```

## Privacy & Security

### Data Protection

- **Authentication Required**: All session history endpoints require GitHub authentication
- **User Isolation**: Users can only access their own session history
- **Secure Storage**: Data is stored in Cloudflare D1 with built-in security features
- **Data Ownership**: You own your data and can delete it at any time

### Data Retention

- Messages are retained indefinitely unless you delete them
- To delete your history, use the DELETE endpoint or contact support

### GDPR Compliance

- You can request deletion of your data at any time
- Your data is stored securely within Cloudflare's infrastructure
- You have full control over your session history

## Implementation Details

### Client-Side Integration

The session history is integrated into the VoiceChat component with minimal overhead:

1. **On Mount**: Load the last 50 messages from the database
2. **On Message**: Automatically save each message to the database
3. **Error Handling**: Graceful degradation if database is unavailable

### Performance

- **Indexing**: Database queries are optimized with appropriate indexes
- **Lazy Loading**: History is loaded only when needed
- **Non-Blocking**: Saving messages doesn't block the UI

### Code Structure

```
src/
├── lib/
│   ├── db/
│   │   └── session-history.ts      # Database service layer
│   ├── session-history-client.ts   # Client-side API wrapper
│   └── VoiceChat.svelte             # Updated with history integration
├── routes/
│   └── api/
│       └── session-history/
│           └── +server.ts           # API endpoints
└── migrations/
    └── 0001_create_session_history.sql  # Database schema
```

## Troubleshooting

### History Not Loading

1. **Check Authentication**: Ensure you're logged in with GitHub
2. **Check Console**: Look for errors in the browser console
3. **Check Database**: Verify the database binding is configured correctly

### Messages Not Saving

1. **Check Network**: Verify API requests are successful in the Network tab
2. **Check Permissions**: Ensure the database has write permissions
3. **Check Logs**: Review server logs for errors

### Database Issues in Development

If you encounter database issues in development:

1. Delete `.wrangler` directory
2. Restart the dev server
3. The database will be recreated automatically

## Future Enhancements

Potential improvements for the session history feature:

- [ ] Search functionality across all conversations
- [ ] Export conversation history
- [ ] Conversation tagging and categorization
- [ ] Shared conversations (team collaboration)
- [ ] Automatic summarization of long conversations
- [ ] Conversation analytics and insights

## Support

If you encounter any issues with session history:

1. Check this documentation
2. Review the troubleshooting section
3. Check GitHub issues for similar problems
4. Open a new issue with details about your problem
