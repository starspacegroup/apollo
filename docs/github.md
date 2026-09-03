# The GitHub tools

The model is given seven functions and calls them itself. It does not describe
what it would do and wait for you to do it; if you ask for an issue, an issue
is created.

| tool                     | what it does                                        | writes? |
| ------------------------ | --------------------------------------------------- | ------- |
| `get_repository_summary` | stats, README, metadata for the selected repository | no      |
| `list_issues`            | open or closed issues                               | no      |
| `search_code`            | code search within the repository                   | no      |
| `get_repository_tree`    | the file tree                                       | no      |
| `create_issue`           | a new issue, title and body                         | **yes** |
| `update_issue`           | title, body, state, labels                          | **yes** |
| `add_issue_comment`      | a comment on an existing issue                      | **yes** |

They are declared in `src/routes/api/voice/+server.ts` and implemented on
octokit in `src/lib/github-helpers.ts`. The same seven are reachable over HTTP
from `POST /api/github` as `getSummary`, `listIssues`, `searchCode`, `getTree`,
`createIssue`, `updateIssue` and `addComment`.

## Authentication

Every call uses the signed-in user's own OAuth token. Apollo holds no GitHub
credential of its own, so the tools can reach exactly what the person can reach
and nothing more. An unauthenticated request is a 401.

## Two things that must stay true

**`tool_choice: 'auto'` must be in the session config.** Without it the
realtime model narrates tool calls as JSON instead of making them, and the
symptom looks like a prompting problem rather than a config one. It is set in
`src/lib/server/voiceProtocol.ts` and pinned by a test in
`voiceProtocol.spec.ts` — that test is the reason this is no longer a recurring
bug, so do not delete it.

**The repository has to be named in the instructions.** The model is told the
owner, the repo and that the tools are already pointed at it. Left vague, it
asks the user which repository they mean, every turn, while holding a tool that
already knows.

## Limits

- One repository per conversation. Switching repositories is a new session.
- No pull request operations, no merges, no branch work. Read, plus the three
  issue writes above.
- Code search is GitHub's, with GitHub's indexing delay. A file committed a
  moment ago may not be findable yet.
- Nothing here writes a _run report_. An actor reporting progress against an
  assignment is the gap named in the umbrella README, and it is still open.
