# Apollo — the web interface

The SvelteKit half of Apollo. It runs on a Cloudflare Worker and does two jobs:

- **Intake.** You talk to it about a repository — by text or by voice — and it
  writes the GitHub issue for you, as a user story with acceptance criteria. It
  calls the GitHub API itself rather than telling you what to paste.
- **The board, read from anywhere.** The local daemon (`../apollod`) pushes a
  snapshot of the fleet here, and this is where you read it when you are not at
  the machine. The browser can _ask_ for things — move a card, pause a fleet —
  and the local half decides whether they happen.

The umbrella repository's `README.md` explains where this sits in the whole.
`plans/dirac-bridge.md` §4 is the contract between the two halves.

## Quick start

```sh
cp .env.example .env      # fill in the four secrets it names
npm install
npm run dev               # http://localhost:8787
```

Sign-in and the GitHub tools need a GitHub OAuth app; voice needs an OpenAI
key; the board needs a D1 database and a KV namespace. `docs/setup.md` walks
through each, and says what still works when one is missing.

## Scripts

| command           | what it does                                     |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Vite dev server on port 8787, bound to `0.0.0.0` |
| `npm test`        | the vitest suites, once                          |
| `npm run check`   | `svelte-check` against `tsconfig.json`           |
| `npm run lint`    | prettier, check-only                             |
| `npm run build`   | production build                                 |
| `npm run preview` | build, then serve it under `wrangler dev`        |
| `npm run deploy`  | build and `wrangler deploy`                      |

CI runs lint, check, test and build on every push and pull request.

## Where things are

```
src/auth.ts                 GitHub OAuth, via @auth/sveltekit
src/lib/github-helpers.ts   the seven GitHub operations, on octokit
src/lib/server/db.ts        D1: users, chat sessions, messages
src/lib/server/link.ts      the daemon's end of the wire — token, snapshot, intents
src/lib/server/voiceProtocol.ts  the OpenAI realtime session config
src/routes/api/            voice, github, sessions, board, intents, link
src/routes/c/[id]/         one conversation, addressable by URL
src/routes/board/          the fleet board
```

## Docs

- [`docs/setup.md`](docs/setup.md) — secrets, OAuth, D1, KV, deploying
- [`docs/github.md`](docs/github.md) — the tools the model can call, and their limits
- [`docs/chat.md`](docs/chat.md) — text and voice in one conversation
- [`docs/sessions.md`](docs/sessions.md) — how a conversation is stored and addressed
- [`docs/testing.md`](docs/testing.md) — what the suites cover, and what only a person can check
