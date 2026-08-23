# Session Database Integration

## Overview

Apollo now stores chat sessions in a Cloudflare D1 database, enabling consistent session history across all devices when users log in with their GitHub account.

## Features

### ✅ Cross-Device Session Sync

- Sessions are automatically synchronized across all devices
- Log in on any device to access your complete chat history
- Real-time synchronization when creating or updating sessions

### ✅ Persistent Storage

- Sessions are stored in Cloudflare D1 (SQLite) database
- Automatic backup and encryption by Cloudflare
- No data loss when switching devices or clearing browser data

### ✅ User-Scoped Sessions

- Each user's sessions are isolated by GitHub user ID
- Secure authentication required for all operations
- Cannot access other users' sessions

### ✅ Local Caching

- Sessions cached in localStorage for offline access
- Fast loading without waiting for database queries
- Automatic sync when back online

## How It Works

### 1. User Authentication

When you log in with GitHub:

1. Your GitHub user ID is used to scope your sessions
2. User information (username, email, avatar) is stored in the database
3. All sessions are linked to your user account

### 2. Session Creation

When you create a new session:

1. Session is created in localStorage immediately (fast)
2. Session is synced to database in background
3. Available on all your devices on next login

### 3. Message Storage

When you send or receive messages:

1. Messages are added to localStorage immediately
2. Messages are synced to database
3. Session's "last message preview" and "updated at" are updated

### 4. Cross-Device Access

When you log in on a different device:

1. Sessions are loaded from database
2. Merged with any local sessions
3. Full chat history available instantly

## Database Schema

### Tables

**users**

- Stores GitHub user information
- Links sessions to specific users

**chat_sessions**

- Stores session metadata (title, repository, timestamps)
- Links to user and contains message preview

**chat_messages**

- Stores individual messages
- Links to specific session
- Includes role (user/assistant/system) and timestamp

### Security

- All database queries are user-scoped (filter by user_id)
- Prepared statements prevent SQL injection
- Authentication required for all API endpoints
- Cloudflare encryption at rest

## API Endpoints

All endpoints require GitHub authentication.

### GET /api/sessions

Get all sessions for the authenticated user.

**Response:**

```json
{
  "sessions": [
    {
      "id": "session_123...",
      "repository": "starspacegroup/apollo",
      "title": "apollo - 1/9/2025",
      "messages": [...],
      "createdAt": 1704931200000,
      "updatedAt": 1704931200000,
      "lastMessagePreview": "How do I implement..."
    }
  ]
}
```

### POST /api/sessions

Create a new session.

**Request:**

```json
{
	"id": "session_123...",
	"repository": "starspacegroup/apollo",
	"title": "New Chat",
	"createdAt": 1704931200000,
	"updatedAt": 1704931200000
}
```

### GET /api/sessions/[sessionId]

Get a specific session with all messages.

### PUT /api/sessions/[sessionId]

Update session metadata.

**Request:**

```json
{
	"title": "Updated Title",
	"updatedAt": 1704931200000,
	"lastMessagePreview": "Latest message..."
}
```

### DELETE /api/sessions/[sessionId]

Delete a session and all its messages.

### POST /api/sessions/[sessionId]/messages

Add messages to a session.

**Request:**

```json
{
	"messages": [
		{
			"role": "user",
			"text": "Hello",
			"timestamp": 1704931200000
		}
	]
}
```

## Setup Instructions

### Local Development

1. **Initialize Database:**

   ```bash
   npx wrangler d1 execute DB --local --file=./schema.sql
   ```

2. **Start Development Server:**

   ```bash
   npm run dev
   ```

3. **Login with GitHub:**
   - Navigate to `http://localhost:5173`
   - Click "Sign in with GitHub"
   - Start chatting - sessions will be saved automatically

### Production Deployment

1. **Create D1 Database:**

   ```bash
   npx wrangler d1 create apollo-sessions
   ```

2. **Update Configuration:**
   Edit `wrangler.jsonc` with your database ID

3. **Initialize Schema:**

   ```bash
   npx wrangler d1 execute apollo-sessions --file=./schema.sql
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

See [DATABASE_SETUP.md](./DATABASE_SETUP.md) for detailed instructions.

## Migration from localStorage-only

If you have existing sessions in localStorage:

1. Log in with GitHub
2. Your local sessions will be automatically synced to the database
3. They will now be available on all your devices

## Troubleshooting

### Sessions not syncing

- Ensure you're logged in with GitHub
- Check browser console for errors
- Verify database is initialized: `npx wrangler d1 execute DB --local --command="SELECT * FROM users LIMIT 1"`

### Can't see sessions from other device

- Make sure you're logged in with the same GitHub account
- Check that sessions were created after database integration was added
- Try refreshing the page to trigger sync

### Database errors in development

- Re-initialize database: `npx wrangler d1 execute DB --local --file=./schema.sql`
- Delete `.wrangler` directory and restart: `rm -rf .wrangler && npm run dev`

## Privacy & Data

### What data is stored?

- GitHub user ID, username, email, avatar URL
- Chat session titles and repositories
- Chat messages (user, assistant, system)
- Timestamps and metadata

### Who can access my data?

- Only you can access your sessions (scoped by GitHub user ID)
- Cloudflare Workers administrators (for system maintenance)
- Nobody else has access to your chat history

### Can I delete my data?

Yes, delete individual sessions in the UI or contact support to delete all data.

### Where is data stored?

Data is stored in Cloudflare D1 databases, which are distributed globally for performance and encrypted at rest.

## Future Enhancements

Potential future improvements:

- Search across all sessions
- Export sessions to JSON/Markdown
- Share sessions with team members
- Session tags and categories
- Analytics on chat usage

## Related Documentation

- [DATABASE_SETUP.md](./DATABASE_SETUP.md) - Detailed setup instructions
- [SESSIONS_IMPLEMENTATION.md](./SESSIONS_IMPLEMENTATION.md) - Technical implementation details
- [GITHUB_AUTH_SETUP.md](./GITHUB_AUTH_SETUP.md) - Authentication setup

## Support

For issues or questions about session storage:

1. Check the troubleshooting section above
2. Review the documentation files
3. Open an issue on GitHub
