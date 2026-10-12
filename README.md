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

Since 2026-10-12 the Activity is **just the agents** (David: _"the activity
interface to just be the agents, I should be able to turn them off and on,
mobile first responsive, and I should be able to talk to them over voice
chat through the activity"_). Opened in any of a project's channels — its
text channels or its `<tag>-voice` — it opens on that project: a grid of
faces, the team first and the bench after, each lit when **speaking**,
**thinking** or **working**, greyed when off, with a switch beside it; and
one mic. Opened anywhere that is no project's channel, it asks which project.

**The switch.** Off is `character.off` on the wire, a manager's or the
owner's; on is `character.on`, the owner's alone — the one raise the wire
carries, and the daemon checks the asking account by id before it puts
anybody on. The snapshot's rooms carry a `bench` beside the `team` so the
page knows who it could put on.

**The voice.** Tap the mic and the page listens: it watches the level, cuts
an utterance at nine hundred milliseconds of quiet, and sends it whole over
a WebSocket to the **voice relay**, a Durable Object (`src/lib/server/relay.ts`)
that holds every viewer's socket and one socket from home. Home is
`apollo-voice` (the daemon repository's `voice/`): it hears the recording
with whisper, says it into the project's room as the viewer's own line
(`apollo say --voice`, which tells the team to answer as one speaks), and
reads the room's answers back to every viewer of the project as text and as
ogg, one voice per character; the page plays them in turn with the speaking
face lit, and speech over the team's voice stops it. A viewer reaches the
relay with a two-minute ticket signed with `AUTH_SECRET`, issued by
`POST /api/activity/voice/ticket` only for a project they may speak in;
home carries the link token. The upgrade is answered in `worker/index.ts`
before SvelteKit, because a Durable Object's 101 has immutable headers and
SvelteKit's cookie pass throws on them — which is also why the adapter is
pointed at `wrangler.build.jsonc` and the real `wrangler.jsonc` names the
entry that exports the Durable Object. The same process also sits in the
project's Discord voice channel when a person is there, hearing each one on
their own stream and answering aloud there too.

The fuller controls — proposals, runs, pause, cap, the transcript — stay on
the hosted board. The daemon polls for intents every ten seconds; the relay
is live.

## Docs

- [`docs/setup.md`](docs/setup.md) — secrets, OAuth, D1, KV, deploying
- [`docs/github.md`](docs/github.md) — the tools the model can call, and their limits
- [`docs/chat.md`](docs/chat.md) — text and voice in one conversation
- [`docs/sessions.md`](docs/sessions.md) — how a conversation is stored and addressed
- [`docs/testing.md`](docs/testing.md) — what the suites cover, and what only a person can check
