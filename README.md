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
cp .env.example .env      # fill in the secrets it names
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

## Who may see what

Since 2026-09-07 the board is read as somebody. Sign in is **Discord** (GitHub
stays for the repository chat, which needs a GitHub token). A person who has
signed in is a _member_; what they see and may do is decided in
`src/lib/server/access.ts` and managed at `/access`:

| role      | sees                              | may ask the machine for                       |
| --------- | --------------------------------- | --------------------------------------------- |
| **owner** | everything                        | everything the wire allows, and grants access |
| **admin** | everything                        | everything the wire allows on every project   |
| **guest** | the projects they hold a grant on | what their level on that project allows       |

A guest's level on a project — or on `*`, every project — is **view** (sees
it), **member** (may also ask for work on it: a request through the ladder,
never a command) or **manager** (may also pause it, switch a capability off,
cap its autonomy, name its team, mark its attention seen). Lowering the whole
fleet is the owner's and an admin's alone, and nothing on the wire can raise
anything, whoever holds it — the machine decides under the dial as before.

The owner is whoever the Worker names: `APOLLO_OWNER=discord:<your user id>`
(comma-separated for more than one). With no owner named, the first person to
sign in on a fresh database becomes the owner, so a new deploy has one — name
yourself before anyone else can reach it. Secrets the Worker needs:
`AUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (an application on
the Discord developer portal with `https://<worker>/auth/callback/discord` as a
redirect), `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` for the repository chat,
and `APOLLO_LINK_TOKEN` for the daemon. Tables: `migrations/0002_access.sql`.

## Docs

- [`docs/setup.md`](docs/setup.md) — secrets, OAuth, D1, KV, deploying
- [`docs/github.md`](docs/github.md) — the tools the model can call, and their limits
- [`docs/chat.md`](docs/chat.md) — text and voice in one conversation
- [`docs/sessions.md`](docs/sessions.md) — how a conversation is stored and addressed
- [`docs/testing.md`](docs/testing.md) — what the suites cover, and what only a person can check
