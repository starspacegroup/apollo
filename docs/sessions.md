# Conversations

A conversation is a repository, a title, and an ordered list of messages. It is
stored twice, on purpose.

## Two stores, one truth

**`localStorage`** holds the conversation as you have it in this browser. It is
what makes the sidebar instant and what keeps a conversation usable when you
are signed out or the network is gone.

**D1** holds it for the account. `src/lib/server/db.ts` owns three tables:

```
users          GitHub user id, username, email, avatar
chat_sessions  id, user_id, repository, title, timestamps, last message preview
chat_messages  session_id, role (user|assistant|system), text, timestamp
```

Both are cascade-deleted from the user down, and both are indexed on the two
queries the UI actually makes: a user's sessions newest-first, and one
session's messages in order.

The store syncs in one direction at a time and never merges: `syncFromDatabase`
pulls the account's list, `syncSessionToDatabase` pushes one conversation,
`deleteSessionFromDatabase` removes one. There is no conflict resolution
because there is no case where two devices write the same conversation at once
— the same conversation open in two tabs is the known rough edge.

## Addressing

`/c/<id>` is one conversation. The id is in the URL, so a conversation is a
link: refreshing keeps you where you were, the back button moves between
conversations, and you can send someone the address of the thing you are
looking at. The root `/` opens a new one.

## Ownership

Every session endpoint checks `user_id` against the signed-in user before it
reads or writes. A session id is not a capability — knowing one gets you
nothing if it is not yours.

## What is not stored

No issue titles, no issue bodies, no comment text. The conversation records
what was said in it; work itself lives in GitHub and is referred to by
`owner/repo#number`. See `plans/state-layer.md` §4 for why that line is drawn
where it is.
