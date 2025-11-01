# Apollo GitHub Assistant - Full Repository Integration

Apollo now has deep integration with GitHub, allowing you to work with your
selected repository using natural conversation.

## Features

### 🔍 Repository Analysis

- **Get Repository Summary**: View stars, forks, languages, topics, and README
  content
- **Browse Code Structure**: Explore the file tree and directory structure
- **Search Code**: Find specific functions, classes, or text patterns in your
  codebase

### 📝 Issue Management

- **Create Issues**: Generate well-structured GitHub issues with Agile best
  practices
- **List Issues**: View open, closed, or all issues with filtering
- **Update Issues**: Modify issue titles, bodies, states, and labels
- **Add Comments**: Comment on existing issues

### 💬 Natural Conversation Interface

Apollo understands natural language requests like:

- "Summarize this repository"
- "Create an issue for adding dark mode"
- "Search for authentication code"
- "List all open issues"
- "Show me the repository structure"

## How It Works

### 1. Select a Repository

Use the repository selector to choose which GitHub repository you want to work
with. Apollo will:

- Load the repository context (files, structure, README)
- Make it available for analysis and discussion
- Enable GitHub operations for that repository

### 2. Talk to Apollo

Start a conversation (text or voice) and ask Apollo to help with:

**Repository Understanding:**

```
"What is this repository about?"
"Show me the main components"
"Search for error handling code"
```

**Issue Creation:**

```
"Create an issue for improving performance"
"I need to add authentication, help me create an issue"
"Make an issue for fixing the login bug"
```

**Repository Operations:**

```
"List the open issues"
"What's the current state of issue #42?"
"Add a comment to issue #15 saying we're working on it"
```

### 3. Apollo Takes Action

When you ask Apollo to perform GitHub operations:

1. Apollo confirms the action with you
2. Uses GitHub API with your authentication
3. Performs the requested operation
4. Shows you the result with a success notification

## Available GitHub Functions

Apollo has access to these GitHub capabilities:

### `get_repository_summary`

Gets comprehensive info about the repository including:

- Repository statistics (stars, forks, issues)
- Primary language and topics
- README content
- Creation and update dates

### `list_issues`

Lists GitHub issues with filtering options:

- State: `open`, `closed`, or `all`
- Limit: Number of issues to return

### `create_issue`

Creates a new GitHub issue with:

- Title and description
- Optional labels
- Formatted according to best practices

### `search_code`

Searches for code in the repository:

- Query string for search
- Returns matching files and paths

### `add_issue_comment`

Adds a comment to an existing issue:

- Issue number
- Comment text in markdown

## Best Practices

### Creating Issues with Apollo

Apollo helps you create high-quality issues by:

1. **Asking Clarifying Questions**
   - What problem are you solving?
   - What's the desired outcome?
   - Who is affected?

2. **Formatting as User Stories** (when appropriate)
   ```
   As a [user type]
   I want [goal]
   So that [benefit]
   ```

3. **Including Acceptance Criteria**
   - Clear, testable conditions
   - Definition of done

4. **Following INVEST Principles**
   - Independent
   - Negotiable
   - Valuable
   - Estimable
   - Small
   - Testable

### Example Conversation

**You:** "I want to add a dark mode to the app"

**Apollo:** "Great idea! Let me help you create an issue for that. Can you tell
me more about:

1. Should dark mode be automatic based on system preference or user-selectable?
2. Which components need dark mode styling?
3. Is this a high priority feature?"

**You:** "User-selectable, all components, medium priority"

**Apollo:** "Perfect! Here's what I'll create:

**Title:** Implement user-selectable dark mode

**User Story:** As a user I want to toggle between light and dark mode So that I
can use the app comfortably in different lighting conditions

**Acceptance Criteria:**

- [ ] Add theme toggle in settings
- [ ] Persist theme preference
- [ ] Apply dark mode styles to all components
- [ ] Ensure proper contrast ratios

Should I create this issue with the label 'enhancement'?"

**You:** "Yes, create it"

**Apollo:** ✅ _Created issue #47: Implement user-selectable dark mode_

## Technical Details

### API Endpoints

**`/api/github` (POST)** Handles all GitHub operations:

```typescript
{
  action: 'getSummary' | 'listIssues' | 'createIssue' | 'searchCode' | ...,
  owner: string,
  repo: string,
  ...params
}
```

### Voice/Chat Integration

The WebSocket server (`/api/voice`) handles:

- Loading repository context when connecting
- Providing GitHub tools to the AI model
- Executing tool calls and returning results
- Notifying the client of successful operations

### Authentication

All GitHub operations use your authenticated session via GitHub OAuth, ensuring:

- Secure API access
- Proper permissions
- Rate limit respect

## UI Feedback

When Apollo performs GitHub actions, you'll see:

- **Loading states**: "Loading repository..."
- **Success notifications**: "✅ Created issue #42: Fix login bug"
- **System messages**: Displayed in green in the chat transcript
- **Error messages**: Clear error descriptions if something goes wrong

## Limitations

- Repository size: Large repositories are truncated to ~500KB of content
- File types: Only specific extensions are loaded (code, markdown, configs)
- Search: GitHub API search rate limits apply
- Functions: Tool execution requires active repository selection

## Troubleshooting

**"Repository not selected or user not authenticated"**

- Ensure you've selected a repository using the selector
- Check that you're logged in with GitHub

**"Failed to load repository"**

- Repository may be private and you lack access
- Check network connection
- Try reloading the page

**"Rate limit exceeded"**

- GitHub API has rate limits
- Wait a few minutes and try again

## Future Enhancements

Planned features:

- Pull request creation and management
- Code review assistance
- Branch operations
- Commit history analysis
- CI/CD integration insights
- Project board management

## Examples

### Creating a Bug Report

```
You: "I found a bug where the login button doesn't work on mobile"
Apollo: "I'll help you create a bug report. What happens when you click the login button on mobile?"
You: "Nothing happens, no error message"
Apollo: "Got it. What mobile device and browser are you using?"
You: "iPhone 13, Safari"
Apollo: "Thanks! Creating the issue now..."
✅ Created issue #48: Login button unresponsive on mobile Safari
```

### Searching Code

```
You: "Where is the authentication logic?"
Apollo: "Let me search for that... I found authentication code in:
- src/lib/auth.ts
- src/routes/api/auth/+server.ts
- src/hooks.server.ts
Would you like me to show you any specific file?"
```

### Listing Issues

```
You: "What issues are currently open?"
Apollo: "You have 5 open issues:
1. #42 - Implement dark mode
2. #45 - Fix mobile navigation
3. #47 - Add user profiles
4. #48 - Login button bug
5. #51 - Improve performance
Would you like details on any of these?"
```

---

**Ready to start?** Select a repository and ask Apollo anything!
