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

## Inside Discord

Since 2026-10-10 the Live screen is also a **Discord Activity** on the Apollo
server. Discord opens the app in an iframe at `<app id>.discordsays.com`, and
its proxy forwards that to `apollo.starspace.group` through the URL mapping
`/` → `apollo.starspace.group` on the application's **Activities** page. The
hub's login cannot run in that sandbox, so the Activity has a door of its own:
Discord lands on `/`, carrying a `frame_id`, and is sent to `/activity`,
where the Embedded App SDK asks Discord for a code; `POST /api/activity/token`
spends it with `DISCORD_CLIENT_SECRET`, asks Discord who the token belongs to,
and issues the same pass cookie the hub's ticket does — `SameSite=None` and
`Partitioned`, so it lives only inside Discord's frames. Then the project's page.

Since 2026-10-12 the Activity is **the agents' interface** (David: _"an
interface of the agents with interactivity to the max"_). Every project
category on the server has a voice channel, `<tag>-voice`, and the Activity
opened there — or in any of the project's text channels — opens on that
project: the team down the left with faces, team names, titles and what each
is doing right now; the room in the middle, read live and spoken into; and
on the right the proposals with approve, edit and reject, the runs in flight
with their phase and a stop, what needs a person, the project's recent feed,
and the controls the wire allows — pause the project, cap its autonomy.
Opened anywhere that is no project's channel, it asks which project.

Every button is an intent on the same wire as the hosted board, checked
against the viewer's level: a line or a work request needs **member**; a
proposal answered, a run stopped or the project lowered needs **manager**.
The owner has all of it. The daemon applies a line as David's when the
Discord account is his and as `outside` otherwise, and the team answers it
as it answers a line written in the channel. The snapshot carries each
room's team, last forty lines, open proposals and runs; faces are pushed
once per change to `/api/link/faces` and read from `/api/face/<key>`, so a
snapshot stays under the Worker's two-megabyte limit. The daemon polls for
intents every ten seconds and pushes within ten of a new line.

## Docs

- [`docs/setup.md`](docs/setup.md) — secrets, OAuth, D1, KV, deploying
- [`docs/github.md`](docs/github.md) — the tools the model can call, and their limits
- [`docs/chat.md`](docs/chat.md) — text and voice in one conversation
- [`docs/sessions.md`](docs/sessions.md) — how a conversation is stored and addressed
- [`docs/testing.md`](docs/testing.md) — what the suites cover, and what only a person can check
