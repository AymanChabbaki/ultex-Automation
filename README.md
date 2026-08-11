# FB Comment Moderator

Listens for new comments on a Facebook Page's posts via the Graph API
webhook, asks OpenAI whether each comment is hate speech/spam/toxic, and
deletes it if so.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `FB_VERIFY_TOKEN` — any string you choose; you'll enter the same value in the Meta App Dashboard.
   - `FB_APP_SECRET` — App Dashboard > Settings > Basic. Used to verify that webhook POSTs actually came from Meta.
   - `PAGE_ACCESS_TOKEN` — a Page access token with `pages_manage_engagement` and `pages_read_user_content`.
   - `PAGE_ID` — the numeric ID of the Page being moderated (used to skip the Page's own comments).
   - `OPENAI_API_KEY`
3. `npm start` (or `npm run dev` to auto-restart on changes).

## Exposing the server for Meta's webhook

Meta needs a public HTTPS URL to reach `/webhook`. For local testing, tunnel
port 3000 with a tool such as ngrok or Cloudflare Tunnel, e.g.:

```
ngrok http 3000
```

Use the resulting `https://...ngrok-free.app` URL as the callback URL below.

## Configure the webhook in the Meta App Dashboard

1. App Dashboard > Webhooks > Page > Subscribe to this object.
2. Callback URL: `https://<your-domain>/webhook`
3. Verify token: same value as `FB_VERIFY_TOKEN`.
4. Subscribe to the `feed` field (this is what delivers comment add/edit/remove events — there is no separate "comments" subscription).
5. Under Page Settings, subscribe your Page to the app so it actually receives events for that Page.

## How it works

- `GET /webhook` — one-time handshake Meta uses to verify the endpoint.
- `POST /webhook` — verified via `X-Hub-Signature-256` (HMAC-SHA256 over
  the raw body, keyed with `FB_APP_SECRET`) before anything else runs, so
  forged requests can't trigger deletions. The server acks with `200`
  immediately, then processes entries asynchronously — Meta expects a
  fast response and will retry/eventually unsubscribe if it's slow.
- For each `feed` change where `item === "comment"` and `verb === "add"`,
  and the commenter isn't the Page itself, the comment text is sent to
  `gpt-4o-mini` with instructions to answer `DELETE` or `KEEP`. `DELETE`
  triggers a Graph API `DELETE` on the comment.
- A bounded in-memory set of recently-seen comment IDs prevents
  Meta's webhook retries (or `edited`/`remove` events for the same
  comment) from re-running moderation on the same comment. This resets
  on restart and isn't shared across multiple instances — swap in Redis
  if you run more than one process.

## Notes / things to decide before going to production

- The moderation call fails closed (`KEEP`) on any unparseable model
  output, since deletion is irreversible — check `src/services/moderation.js`
  if you want stricter behavior.
- There's no retry/backoff on OpenAI or Graph API calls; a failed
  moderation or delete call is logged and dropped rather than retried.
- Deleting a comment is permanent and not visible to the poster as
  moderation — consider hiding (`is_hidden`) instead of deleting if you
  want a less destructive first step, or want an audit trail.
- If comment volume gets high enough that in-process async handling
  causes backpressure, put a real queue (Redis/BullMQ, SQS, etc.) between
  the webhook handler and the OpenAI/Graph API calls instead of awaiting
  inline.
