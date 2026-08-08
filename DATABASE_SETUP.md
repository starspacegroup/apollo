# Database Setup for Apollo

This guide explains how to set up the Cloudflare D1 database for Apollo's session storage.

## Overview

Apollo uses Cloudflare D1 (SQLite-based serverless database) to store user sessions and chat history. This enables session history to be consistent across all devices when users log in with their GitHub account.

## Local Development Setup

### 1. Create a Local D1 Database

For local development, Wrangler will automatically create a local SQLite database:

```bash
# This creates a local .wrangler directory with a SQLite database
npm run dev
```

### 2. Initialize the Database Schema

Run the SQL schema to create tables:

```bash
# Using wrangler d1 execute for local database
npx wrangler d1 execute DB --local --file=./schema.sql
```

Or manually initialize during development by running:

```bash
# Connect to local database
npx wrangler d1 execute DB --local --command="$(cat schema.sql)"
```

## Production Setup

### 1. Create a D1 Database

Create a new D1 database in your Cloudflare account:

```bash
npx wrangler d1 create apollo-sessions
```

This will output a database ID. Copy this ID.

### 2. Update wrangler.jsonc

Update the `database_id` in `wrangler.jsonc` with your production database ID:

```jsonc
{
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "apollo-sessions",
			"database_id": "your-production-database-id-here"
		}
	]
}
```

### 3. Initialize Production Database

Run the schema against your production database:

```bash
npx wrangler d1 execute apollo-sessions --file=./schema.sql
```

### 4. Deploy

Deploy your application:

```bash
npm run deploy
```

## Database Schema

The database consists of three main tables:

### users

Stores GitHub user information:

- `id` (TEXT, PRIMARY KEY) - GitHub user ID
- `username` (TEXT) - GitHub username
- `email` (TEXT) - User email
- `avatar_url` (TEXT) - User avatar URL
- `created_at` (INTEGER) - Unix timestamp
- `updated_at` (INTEGER) - Unix timestamp

### chat_sessions

Stores chat sessions:

- `id` (TEXT, PRIMARY KEY) - Unique session ID
- `user_id` (TEXT, FOREIGN KEY) - References users(id)
- `repository` (TEXT) - GitHub repository path
- `title` (TEXT) - Session title
- `created_at` (INTEGER) - Unix timestamp
- `updated_at` (INTEGER) - Unix timestamp
- `last_message_preview` (TEXT) - Preview of last message

### chat_messages

Stores individual messages:

- `id` (INTEGER, PRIMARY KEY AUTOINCREMENT)
- `session_id` (TEXT, FOREIGN KEY) - References chat_sessions(id)
- `role` (TEXT) - 'user', 'assistant', or 'system'
- `text` (TEXT) - Message content
- `timestamp` (INTEGER) - Unix timestamp

## API Endpoints

The following API endpoints are available for session management:

- `GET /api/sessions` - Get all sessions for authenticated user
- `POST /api/sessions` - Create a new session
- `GET /api/sessions/[sessionId]` - Get a specific session
- `PUT /api/sessions/[sessionId]` - Update a session
- `DELETE /api/sessions/[sessionId]` - Delete a session
- `POST /api/sessions/[sessionId]/messages` - Add messages to a session

## Data Synchronization

### Client-Side (localStorage)

Sessions are cached locally in the browser's localStorage for offline access and fast loading.

### Server-Side (D1 Database)

Sessions are persisted to the D1 database for cross-device synchronization.

### Sync Strategy

1. **On Login**: Sessions are loaded from the database and merged with local sessions
2. **On Session Create**: New sessions are created in both localStorage and database
3. **On Message Add**: Messages are added to localStorage immediately and synced to database
4. **On Session Delete**: Sessions are removed from both localStorage and database

## Security Considerations

✅ **User Isolation**: All queries filter by user_id to ensure users can only access their own sessions

✅ **Authentication Required**: All API endpoints require valid GitHub authentication

✅ **SQL Injection Protection**: All queries use prepared statements with parameter binding

✅ **Rate Limiting**: Cloudflare provides automatic rate limiting for Workers

✅ **Encrypted Storage**: D1 databases are encrypted at rest by Cloudflare

## Maintenance

### Viewing Database Contents

View users:

```bash
npx wrangler d1 execute apollo-sessions --command="SELECT * FROM users LIMIT 10"
```

View sessions:

```bash
npx wrangler d1 execute apollo-sessions --command="SELECT * FROM chat_sessions LIMIT 10"
```

View messages:

```bash
npx wrangler d1 execute apollo-sessions --command="SELECT * FROM chat_messages LIMIT 10"
```

### Backup Database

```bash
# Export database to SQL
npx wrangler d1 export apollo-sessions --output=backup.sql
```

### Clear Database (Development Only)

```bash
npx wrangler d1 execute apollo-sessions --command="DELETE FROM chat_messages; DELETE FROM chat_sessions; DELETE FROM users;"
```

## Troubleshooting

### Database not available error

- Ensure wrangler.jsonc has correct database binding
- Verify database exists: `npx wrangler d1 list`
- Check database ID matches configuration

### Schema errors

- Re-run schema: `npx wrangler d1 execute DB --local --file=./schema.sql`
- Check for syntax errors in schema.sql

### Local development issues

- Delete `.wrangler` directory and restart: `rm -rf .wrangler && npm run dev`
- Ensure you're running latest wrangler: `npm install -g wrangler@latest`

## Migration from localStorage-only

Users with existing localStorage sessions will automatically have them synced to the database on first API call after authentication. The sync happens transparently in the background.

## Further Reading

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Wrangler D1 Commands](https://developers.cloudflare.com/workers/wrangler/commands/#d1)
- [SvelteKit with Cloudflare](https://kit.svelte.dev/docs/adapter-cloudflare)
