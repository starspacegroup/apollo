# Debugging Tool Calling - Changes Made

## Issue Identified

The LLM was returning JSON responses like
`{"owner":"starspacegroup","repo":"hermes"}` instead of actually calling the
GitHub API tools.

## Root Causes

1. **Missing `tool_choice` configuration** - The OpenAI Realtime API wasn't
   explicitly configured to use function calling
2. **Unclear repository context** - The system prompt didn't make it clear
   enough that the repository context was already set
3. **Insufficient logging** - Hard to debug what was happening during tool calls

## Changes Made

### 1. Added `tool_choice: 'auto'` to Session Config

**File**: `src/routes/api/voice/+server.ts`

```typescript
session: {
  // ... other config
  tools,
  tool_choice: 'auto' // Enable automatic tool calling
}
```

This tells OpenAI to automatically decide when to use tools based on the
conversation.

### 2. Enhanced Repository Context

Made the repository context much more explicit:

```typescript
repoContext =
  `You are currently working with the GitHub repository: **${repository}**\n`;
repoContext += `Repository Owner: ${owner}\n`;
repoContext += `Repository Name: ${repo}\n\n`;
repoContext +=
  `IMPORTANT: You have DIRECT ACCESS to GitHub API tools for the ${repository} repository.\n`;
repoContext += `Available actions:\n`;
repoContext += `- Get repository summary (use get_repository_summary tool)\n`;
repoContext += `- List issues (use list_issues tool)\n`;
// ... etc
repoContext +=
  `When users ask you to perform these actions, you MUST USE THE TOOLS. Do NOT return JSON objects or describe what you would do - EXECUTE THE TOOL CALLS.\n\n`;
```

### 3. Removed Auto-Introduction Message

Removed the automatic initial message that was sent on connection. This could
have been confusing the model's context.

### 4. Enhanced Logging

Added more detailed logging for debugging:

```typescript
// Log more details for responses
if (message.type.includes("response")) {
  console.log(
    "Response details:",
    JSON.stringify(message, null, 2).substring(0, 500),
  );
}

console.log("Tool call executing:", functionName, "with args:", args);
```

## Testing Instructions

### Reload the Application

1. The dev server should auto-reload with the changes
2. If not, stop and restart: `npm run dev`

### Test These Commands

**Basic Tool Calls:**

1. "List the open issues" → Should call `list_issues` tool
2. "Tell me about this repository" → Should call `get_repository_summary` tool
3. "Search for authentication code" → Should call `search_code` tool
4. "Show me the file structure" → Should call `get_repository_tree` tool

**Expected Behavior:**

- You should see console logs like:
  `Tool call executing: list_issues with args: { state: 'open' }`
- Apollo should respond with actual data, not JSON objects
- You should see actual issue lists, repository info, etc.

### What to Look For in Console

**Good signs:**

```
OpenAI message type: response.output_item.added
Function call item added: {...}
Tool call executing: list_issues with args: {...}
OpenAI message type: response.output_item.done
```

**Bad signs (if still happening):**

```
OpenAI message type: response.text.delta
// No function call messages
// Apollo returns JSON like {"owner":"...", "repo":"..."}
```

## If Tools Still Don't Work

### Debug Checklist:

1. **Check console logs** - Look for "Tool call executing" messages
2. **Verify repository is selected** - Check the UI shows connected repository
3. **Check authentication** - Make sure you're signed in with GitHub
4. **Try explicit commands** - "Use the list_issues tool to show me open issues"
5. **Check OpenAI API** - Verify your API key has Realtime API access

### Additional Debugging:

Add this to the browser console to see WebSocket messages:

```javascript
// In browser console
window.addEventListener("message", (e) => console.log("WS:", e.data));
```

## Model Configuration Notes

The `gpt-4o-mini-realtime-preview` model supports function calling but requires:

- ✅ Tools array properly formatted
- ✅ `tool_choice` configured (now set to 'auto')
- ✅ Clear instructions about when to use tools
- ✅ Repository context that makes it clear tools are available

## Next Steps if Issue Persists

If the model still doesn't call tools:

1. Try setting `tool_choice: 'required'` to force tool usage (may be too
   aggressive)
2. Try `gpt-4o-realtime-preview` instead (larger model, better at function
   calling)
3. Add few-shot examples directly in the system prompt
4. Check if OpenAI has updated the Realtime API function calling format

---

**Updated**: November 7, 2025 **Status**: Changes deployed, awaiting testing
