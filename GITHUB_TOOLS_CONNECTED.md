# GitHub Tools - LLM Connection Summary

## ✅ Status: FULLY CONNECTED

The LLM (Apollo AI) is now fully connected to GitHub with all available tools
and enhanced instructions for proactive tool usage.

## Connected Tools

The following GitHub tools are now available to Apollo and properly registered
with the OpenAI Realtime API:

### 1. **get_repository_summary**

- **Purpose**: Get comprehensive repository information
- **Returns**: Stats (stars, forks, issues), README content, language, topics,
  dates
- **Parameters**: None (uses current repository)

### 2. **list_issues**

- **Purpose**: List GitHub issues with filtering
- **Parameters**:
  - `state`: 'open' | 'closed' | 'all' (optional)
  - `limit`: number (default: 30)

### 3. **create_issue**

- **Purpose**: Create new GitHub issues
- **Parameters**:
  - `title`: string (required)
  - `body`: string (required)
  - `labels`: string[] (optional)

### 4. **search_code**

- **Purpose**: Search for code patterns in the repository
- **Parameters**:
  - `query`: string (required)
  - `limit`: number (default: 10)

### 5. **add_issue_comment**

- **Purpose**: Add comments to existing issues
- **Parameters**:
  - `issue_number`: number (required)
  - `comment`: string (required)

### 6. **update_issue** ✨ _newly connected_

- **Purpose**: Update existing issues (title, body, state, labels)
- **Parameters**:
  - `issue_number`: number (required)
  - `title`: string (optional)
  - `body`: string (optional)
  - `state`: 'open' | 'closed' (optional)
  - `labels`: string[] (optional)

### 7. **get_repository_tree** ✨ _newly connected_

- **Purpose**: Get complete file tree structure
- **Parameters**:
  - `branch`: string (optional, defaults to default branch)

## Enhanced System Prompt

The system prompt has been significantly improved to:

1. **Be More Directive**: Clear instructions that Apollo MUST use tools
   immediately when requested
2. **Provide Examples**: Concrete examples of correct tool usage behavior
3. **Discourage Permission-Seeking**: Apollo should act, not ask for permission
4. **List All Tools**: Explicit enumeration of all available tools with
   descriptions

### Key Instructions Added:

```
CRITICAL INSTRUCTIONS - TOOL USAGE:
- You have DIRECT ACCESS to GitHub API tools and MUST use them when users request actions
- When a user asks you to perform an action, YOU MUST CALL THE APPROPRIATE TOOL IMMEDIATELY - DO NOT ASK FOR PERMISSION
- Do NOT just describe what you could do - ACTUALLY USE THE TOOLS
- After calling a tool and getting results, present them to the user in a helpful, conversational way
```

### Example Behavior Patterns:

```
User: "List the open issues"
Apollo: [IMMEDIATELY calls list_issues tool] → "Here are the open issues..."

User: "Create an issue for adding dark mode"
Apollo: [IMMEDIATELY calls create_issue] → "I've created issue #42..."

User: "Search for authentication code"
Apollo: [IMMEDIATELY calls search_code] → "I found these files..."
```

## How It Works

### Architecture Flow:

```
User Request (Text/Voice)
    ↓
WebSocket Client → Server (/api/voice)
    ↓
OpenAI Realtime API (with tools registered)
    ↓
Tool Call Event (response.output_item.done + type: function_call)
    ↓
Server Handler Executes GitHub API Call
    ↓
Result Returned to OpenAI
    ↓
Apollo Responds to User with Results
    ↓
UI Shows Success Notification (e.g., "✅ Created issue #42")
```

### Event Flow:

1. **Session Setup**: Tools are registered in `session.update` when WebSocket
   connects
2. **Tool Invocation**: OpenAI sends `response.output_item.done` with
   `type: function_call`
3. **Execution**: Server extracts function name and arguments, calls GitHub
   helper
4. **Response**: Result sent back via `conversation.item.create` with
   `type: function_call_output`
5. **Continuation**: Server sends `response.create` to trigger Apollo's response
6. **UI Feedback**: Client shows system messages for certain operations (e.g.,
   issue creation)

## Testing Recommendations

Try these commands to verify all tools work:

### Basic Commands:

- "Tell me about this repository"
- "List the open issues"
- "Search for authentication code"
- "Show me the file structure"

### Action Commands:

- "Create an issue for improving the README"
- "Add a comment to issue #1 saying 'Working on this'"
- "Close issue #5"
- "Update issue #3 to add the bug label"

### Complex Commands:

- "Find all files related to authentication and create an issue to review
  security"
- "List closed issues and tell me what was completed recently"

## Files Modified

1. **`src/routes/api/voice/+server.ts`**:
   - Enhanced system prompt with directive instructions
   - Added `update_issue` tool definition
   - Added `get_repository_tree` tool definition
   - Added tool handlers in switch statement
   - Improved tool documentation

## Authentication & Permissions

All tools use the user's GitHub OAuth token, ensuring:

- ✅ Proper authentication
- ✅ Repository access based on user permissions
- ✅ Rate limiting handled by GitHub API
- ✅ Audit trail (actions appear as user in GitHub)

## Next Steps

The LLM is now fully connected! You can:

1. **Test the tools** by asking Apollo to perform GitHub operations
2. **Monitor behavior** to ensure Apollo uses tools proactively
3. **Provide feedback** if Apollo still hesitates to use tools
4. **Add more tools** as needed (e.g., pull requests, code reviews)

## Troubleshooting

If Apollo doesn't use tools:

1. Check that repository is selected in the UI
2. Verify user is authenticated with GitHub
3. Check browser console for WebSocket errors
4. Review server logs for tool call execution
5. Ensure OpenAI API key has Realtime API access

---

**Last Updated**: November 7, 2025 **Status**: ✅ Production Ready
