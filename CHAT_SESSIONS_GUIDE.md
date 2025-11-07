# Chat Sessions & History Guide

## Overview

Apollo now includes a comprehensive chat sessions and history management system
that allows you to:

- Save and organize conversations with your repositories
- Switch between different chat sessions
- Resume previous conversations
- Automatically create new sessions when switching repositories

## Features

### 1. **Session Persistence**

- All chat conversations are automatically saved to browser localStorage
- Sessions persist across browser sessions
- Up to 100 most recent sessions are stored

### 2. **Sessions Panel**

The Sessions Panel is located in the top-right navigation bar and displays:

- Total number of saved sessions
- Grouped sessions by time period (Today, Yesterday, Last 7 Days, Last 30 Days,
  Older)
- Session title, repository, timestamp, and message count
- Preview of the last message

### 3. **Session Actions**

#### **Creating a New Session**

- Click the "New Chat" button in the Sessions Panel
- A new session is automatically created when you select a repository for the
  first time
- When switching repositories, a new session is automatically created for that
  repository

#### **Switching Sessions**

- Click on any session in the Sessions Panel
- The conversation transcript will be loaded
- If the session is for a different repository, Apollo will automatically switch
  to that repository

#### **Renaming Sessions**

- Hover over a session and click the edit (pencil) icon
- Enter a new title and press Enter to save
- Press Escape to cancel

#### **Deleting Sessions**

- Hover over a session and click the delete (trash) icon
- Confirm the deletion in the dialog

### 4. **Visual Indicators**

#### **Active Session**

- The currently active session is highlighted with a purple background in the
  Sessions Panel
- When viewing the welcome screen, the current session title is displayed

#### **Connection Status**

- Green indicator dot shows when connected to AI
- Session count badge shows total number of saved sessions

### 5. **Repository Integration**

When you switch repositories:

1. A new session is automatically created for that repository
2. Previous session for the old repository is saved
3. You can return to previous repository sessions at any time

When you load a session for a different repository:

1. Apollo automatically switches to that repository
2. The WebSocket connection is established for that repository
3. Conversation history is loaded

## Session Data Structure

Each session contains:

- **ID**: Unique identifier
- **Repository**: The GitHub repository (e.g., "starspacegroup/apollo")
- **Title**: Custom or auto-generated title
- **Messages**: Full conversation history with timestamps
- **Created/Updated**: Timestamps for session management
- **Preview**: Last message preview for quick reference

## Technical Details

### Storage

- Sessions are stored in browser localStorage under the key
  `apollo_chat_sessions`
- Maximum of 100 sessions are stored (oldest are pruned)
- Each message includes role (user/assistant/system), text, and timestamp

### State Management

The session system uses Svelte stores:

- `sessionStore`: Main store for session CRUD operations
- `currentSession`: Derived store for the active session
- `allSessions`: Derived store for all sessions sorted by update time
- `currentSessionMessages`: Derived store for current session messages

### Automatic Syncing

- Messages are automatically synced to the current session as they're
  sent/received
- Transcript updates are persisted in real-time
- Session metadata (title, preview, timestamps) is updated automatically

## Best Practices

1. **Organize Your Sessions**: Rename sessions with descriptive titles to easily
   find them later
2. **Regular Cleanup**: Delete old or unnecessary sessions to keep your history
   manageable
3. **Repository-Specific Workflows**: Each repository gets its own session
   automatically, keeping conversations contextually separate
4. **Quick Access**: Use the Sessions Panel to quickly jump between different
   repository conversations

## Keyboard Shortcuts

- **Enter**: Save session title when editing
- **Escape**: Cancel title editing
- **Tab**: Navigate through sessions panel

## Known Limitations

1. Sessions are stored locally in the browser - clearing browser data will
   delete all sessions
2. Sessions are not synced across different browsers or devices
3. Maximum of 100 sessions are stored (oldest are automatically removed)

## Future Enhancements

Potential future improvements:

- Cloud sync for sessions across devices
- Export/import session history
- Search within session history
- Tag/categorize sessions
- Share sessions with team members
