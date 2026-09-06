# Testing

```sh
npm test        # vitest, once
npm run check   # svelte-check
npm run lint    # prettier, check-only
```

CI runs all three plus a production build, on every push and pull request.

## What the suites cover

39 tests across eight files, in two vitest projects — a server project for
plain modules and a browser project (chromium, via playwright) for components.
Nothing is skipped.

| file                                | what it pins                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `lib/server/voiceProtocol.spec.ts`  | the realtime session config, including `tool_choice: 'auto'`, and close-code mapping             |
| `lib/server/link.spec.ts`           | the daemon wire: token comparison, what an unauthenticated call gets, what the daemon may not do |
| `lib/realtimeModel.spec.ts`         | which models accept images, and the sentence shown when one does not                             |
| `lib/realtimeResponseState.spec.ts` | response state transitions                                                                       |
| `lib/stores/sessionStore.spec.ts`   | session creation, message append, persistence                                                    |
| `lib/stores/themeStore.spec.ts`     | theme selection and persistence                                                                  |
| `routes/page.svelte.spec.ts`        | the root page renders                                                                            |

Several of these exist because the thing they pin was once a bug. The
`tool_choice` assertion in particular is the reason tool calling stopped
silently regressing — treat it as load-bearing.

## The session store, and why it is tested against a real engine

`lib/server/db.spec.ts` runs the real functions, with the real `schema.sql`,
against a real SQLite database — `node:sqlite`, which ships with Node and is
not a dependency. `lib/server/d1-memory.ts` is the thin adapter that gives it
D1's interface: `prepare().bind().run()/all()/first()`, foreign keys on.

It is written that way on purpose. A hand-written fake that matched query
strings would pass whatever the queries happened to say, which is the same
nothing that the file this replaced asserted — thirteen `it.skip` cases whose
bodies were `expect(true).toBe(true)`, excused by a comment saying real tests
"would need a test database".

The load-bearing half is ownership. A session id must not be a capability, so
every function that takes one also takes a `userId` and must refuse a session
that is not that user's — read, append, retitle and delete alike, and a
forbidden session must answer the same as a missing one so the API cannot be
used to discover which ids exist. Deleting the predicate from `db.ts` fails
these tests, which is the only evidence that they test anything.

## What is not covered

**The HTTP layer.** The tests exercise `db.ts`, which is where the ownership
checks live. The endpoints in `routes/api/sessions/` do their own `locals.auth()`
check before calling it; that check is not tested.

**The relay end to end.** Nothing exercises browser → Worker → OpenAI. The
config is tested; the socket is not.

**Voice.** Audio capture, VAD behaviour and barge-in are not automatable here.

## Checking by hand

The things only a person can confirm, in the order worth doing them:

1. Sign in with GitHub, pick a repository.
2. Type: _"what is this repo?"_ — expect a summary, not a question about which
   repository you mean.
3. Type: _"open an issue for the missing rate limit on the login endpoint"_ —
   expect a real issue with acceptance criteria, and check it on GitHub.
4. Speak the same request. Confirm one transcript holds both the typed and the
   spoken turns.
5. Pause mid-sentence for about a second. The assistant should wait, not
   interrupt.
6. Reload on `/c/<id>`. The conversation should still be there.
7. Sign out, reload. The sidebar should still show local conversations.
8. Open `/board` with no KV namespace bound. It should say there is no
   snapshot, not show invented data.
