# Setup

Four secrets, one database, one KV namespace. Nothing here is optional in
production, but the app degrades in a stated way when a piece is missing, so
you can set them up one at a time.

## Secrets

Copy `.env.example` to `.env` and fill it in. Every value is read through
`$env/dynamic/private`, never `$env/static/private` — on a Worker the static
form bakes secrets into the build artifact and fails the build when they are
absent. `src/auth.ts` says so at the top; do not change it back.

| variable               | needed for                     | if it is missing                                                      |
| ---------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | sign-in, every GitHub tool     | sign-in fails; unauthenticated requests get a 401 rather than a 500   |
| `GITHUB_CLIENT_SECRET` | the same                       | the same                                                              |
| `AUTH_SECRET`          | session cookies                | sign-in fails                                                         |
| `OPENAI_API_KEY`       | voice and text chat            | the chat endpoint refuses                                             |
| `APOLLO_LINK_TOKEN`    | the wire from the local daemon | the Worker refuses every daemon request, so the board has no snapshot |

`AUTH_SECRET` wants 32 random bytes: `openssl rand -base64 32`.

`APOLLO_LINK_TOKEN` is the one that is easy to miss — it appears in no example
file until you add it, and nothing about a missing snapshot points at it. The
same value must be set on the daemon side. A Worker with no token configured
refuses everything, on purpose: an unset secret must not read as "no
authentication required".

## The GitHub OAuth app

Create one at <https://github.com/settings/developers>.

- Authorization callback URL, development: `http://localhost:8787/auth/callback/github`
- Authorization callback URL, production: `https://<your-domain>/auth/callback/github`

The token the app receives is the signed-in user's own. Apollo holds no
credential of its own for GitHub and can do nothing the person could not do
themselves.

## The database

Two SQL files, both of which must be applied. They are different halves and
neither supersedes the other.

- `schema.sql` — users, chat sessions, chat messages. The conversation half.
- `migrations/0001_register.sql` — snapshots and intents. The board half.

Local:

```sh
npx wrangler d1 execute apollo-sessions --local --file=./schema.sql
npx wrangler d1 execute apollo-sessions --local --file=./migrations/0001_register.sql
```

Production — create the database first, then paste the id it prints into the
`d1_databases` block in `wrangler.jsonc`, which ships with the placeholder
`preview-database-id`:

```sh
npx wrangler d1 create apollo-sessions
npx wrangler d1 execute apollo-sessions --remote --file=./schema.sql
npx wrangler d1 execute apollo-sessions --remote --file=./migrations/0001_register.sql
```

The schema deliberately holds no issue titles, bodies or comments. GitHub owns
work; Apollo owns actors and runs (`plans/state-layer.md` §4). A column here
carrying the _content_ of a piece of work would make Apollo a mirror of GitHub
with a sync bug.

## The KV namespace

The board's current snapshot is one blob that is always read whole, so it lives
in KV rather than D1 — D1 keeps the trail, KV answers "what is happening right
now" without a query.

```sh
npx wrangler kv namespace create APOLLO_SNAPSHOT
```

Paste the id into `wrangler.jsonc`, replacing `replace-with-a-real-namespace-id`.
Until you do, the binding is absent and the board says so rather than showing
invented data.

## Deploying

```sh
npm run deploy
```

Secrets do not come from `.env` in production. Set each one:

```sh
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put APOLLO_LINK_TOKEN
# and the three auth values
```

## Running against the local daemon

The daemon pushes to `/api/link/snapshot` and reads `/api/link/intents`,
authenticating with `APOLLO_LINK_TOKEN`. Its credential is scoped to exactly
that: it can push a snapshot, read pending intents and acknowledge them. It
cannot read a chat session, cannot reach GitHub, and cannot create an intent —
the machine does not get to ask itself for work.
