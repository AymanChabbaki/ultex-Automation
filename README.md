# FB Comment Moderator

Listens for new comments on a Facebook Page's posts via the Graph API
webhook, asks OpenAI whether each comment is hate speech/spam/toxic, and
deletes it if so.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `FB_VERIFY_TOKEN` — any string you choose; you'll enter the same value in the Meta App Dashboard.
   - `FB_APP_SECRET` — App Dashboard > Settings > Basic. Used to verify that webhook POSTs actually came from Meta.
   - `PAGE_ACCESS_TOKEN` — a Page access token with `pages_manage_engagement`, `pages_read_user_content`, and
     `pages_manage_metadata` (needed to subscribe the Page to webhook events — see step 5 below). Generate via
     Graph API Explorer: request a User token with those scopes (plus `pages_show_list`), optionally exchange it
     for a long-lived one, then call `GET /me/accounts?access_token=<user-token>` and take the `access_token`
     field for your Page from the response — that's the Page token, not the user token.
   - `PAGE_ID` — the numeric ID of the Page being moderated (used to skip the Page's own comments).
   - `OPENAI_API_KEY`
   - `DASHBOARD_USER` / `DASHBOARD_PASSWORD` — optional, enables the moderation dashboard (see below).
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
5. Subscribing the *app* to `feed` in the dashboard is not enough on its own — the *Page* also has to be told to
   send events to the app, which has no dashboard toggle and has to be done via the Graph API directly:
   ```
   curl -X POST "https://graph.facebook.com/v19.0/<PAGE_ID>/subscribed_apps?subscribed_fields=feed&access_token=<PAGE_ACCESS_TOKEN>"
   ```
   Expect `{"success":true}`. Verify anytime with a `GET` to the same URL (drop the POST) — `data` should be non-empty.

## How it works

- `GET /webhook` — one-time handshake Meta uses to verify the endpoint.
- `POST /webhook` — verified via `X-Hub-Signature-256` (HMAC-SHA256 over
  the raw body, keyed with `FB_APP_SECRET`) before anything else runs, so
  forged requests can't trigger deletions. The server acks with `200`
  immediately, then processes entries asynchronously — Meta expects a
  fast response and will retry/eventually unsubscribe if it's slow.
- For each `feed` change where `item === "comment"` and `verb === "add"`,
  and the commenter isn't the Page itself, the comment text is fetched via
  `GET /{comment-id}?fields=message` (the webhook payload itself doesn't
  include the comment text on current Graph API versions — only IDs and
  metadata) and sent to `gpt-4o-mini` with instructions to answer `DELETE`
  or `KEEP`. `DELETE` triggers a Graph API `DELETE` on the comment.
- A bounded in-memory set of recently-seen comment IDs prevents
  Meta's webhook retries (or `edited`/`remove` events for the same
  comment) from re-running moderation on the same comment. This resets
  on restart and isn't shared across multiple instances — swap in Redis
  if you run more than one process.
- Every decision (kept/deleted/error) is logged to `src/services/eventLog.js`,
  which backs the dashboard below.

## Moderation dashboard

`GET /webhook/dashboard` (HTTP Basic Auth via `DASHBOARD_USER`/`DASHBOARD_PASSWORD`)
shows recent moderation decisions with kept/deleted/error counts, auto-refreshing
every 15s. The underlying data is also available as JSON at `GET /webhook/api/events`.
Returns `503` if the dashboard credentials aren't set — it shows real commenters'
text, so it's disabled by default rather than silently public. Backed by an
in-memory ring buffer plus an append-only `data/events.jsonl` file so history
survives restarts (see `DEPLOY.md` for the volume mount needed to survive
container recreation in production).

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
