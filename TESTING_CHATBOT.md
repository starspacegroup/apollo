# Testing Chatbot Repository Awareness

## How to Test

1. **Start the dev server**: `npm run dev`
2. **Sign in with GitHub**: Use the login button
3. **Select a repository**: Choose any repository from the selector
4. **Wait for connection**: You should see a green connection indicator on the
   repository badge
5. **Test the chatbot**: Try these commands:

### Test Commands

#### 1. Test Repository Awareness

```
What repository am I working with?
```

Expected: The AI should know which repository you selected.

#### 2. Test Repository Summary Tool

```
Get me a summary of this repository
```

Expected: The AI should call `get_repository_summary` tool and return repo
stats, description, README, etc.

#### 3. Test List Issues Tool

```
List the open issues in this repository
```

Expected: The AI should call `list_issues` tool with state='open' and show the
issues.

#### 4. Test Search Code Tool

```
Search for "function" in the code
```

Expected: The AI should call `search_code` tool and return matching files/lines.

#### 5. Test Create Issue Tool

```
Create an issue titled "Test Issue" with the description "This is a test issue"
```

Expected: The AI should call `create_issue` tool and confirm the issue was
created.

#### 6. Test Add Comment Tool

```
Add a comment "This is a test comment" to issue #1
```

Expected: The AI should call `add_issue_comment` tool and confirm the comment
was added.

## Debugging

### Check Server Logs

Look for these log messages in the terminal:

- `Client connected to voice WebSocket for repository: <repo-name>`
- `Connected to OpenAI Realtime API`
- `Sending session config with X tools for repository: <repo-name>`
- `OpenAI message type: <event-type>` (for various OpenAI events)
- `Function call item added: <function-details>` (when AI decides to use a tool)
- `Tool call executing: <function-name> <args>` (when tool is actually executed)

### Check Browser Console

- Open DevTools Console
- Look for WebSocket connection messages
- Check for any errors

### Common Issues

1. **"Repository not selected"**: Make sure you've selected a repo from the
   dropdown
2. **"No response"**: Check that OpenAI API key is configured in `.dev.vars`
3. **"Tools not being called"**: Check server logs to see if function calls are
   detected
4. **"Authentication error"**: Make sure you're signed in with GitHub

## Expected Flow

1. User selects repository → WebSocket connects with `?repo=owner/repo`
2. Server receives connection → Sets up OpenAI connection with repository
   context
3. OpenAI receives session config → Includes tools and repository-aware
   instructions
4. AI sends initial greeting → Mentions the repository and capabilities
5. User asks for action → AI calls appropriate tool
6. Server executes tool → Returns results to OpenAI
7. OpenAI responds to user → With the results in natural language

## System Prompt Verification

The AI should have these key instructions:

- "You are currently working with the GitHub repository: **owner/repo**"
- "You have DIRECT ACCESS to GitHub API tools"
- "YOU MUST CALL THE APPROPRIATE TOOL IMMEDIATELY"
- List of available tools: get_repository_summary, list_issues, create_issue,
  search_code, add_issue_comment

## Tool Event Types

The OpenAI Realtime API uses these event types for function calls:

- `response.output_item.added` - When a function call is added to the response
- `response.output_item.done` - When the function call is complete and ready to
  execute
- The item will have `type: 'function_call'` and include `name`, `arguments`,
  and `call_id`
