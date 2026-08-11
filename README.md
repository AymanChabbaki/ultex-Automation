# FB/IG Comment Moderator

Listens for new comments on a Facebook Page's posts (and, optionally, a
linked Instagram account) via the Graph API webhook, asks OpenAI whether
each comment should be removed, and deletes it if so.

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

## Also moderating Instagram comments

Works the same way, through the same webhook endpoint and the same `PAGE_ACCESS_TOKEN`, for an Instagram
Business/Creator account linked to this Page:

1. Confirm the IG account is linked: Page Settings > Linked Accounts (or it was linked when the Page was set up).
2. Regenerate `PAGE_ACCESS_TOKEN` with two extra scopes added: `instagram_basic`, `instagram_manage_comments`
   (same Graph API Explorer + `/me/accounts` flow as above).
3. In App Dashboard > Webhooks, switch the object dropdown to **Instagram** and subscribe to the `comments` field
   (separate from the Page's `feed` subscription above — you need both).
4. Find the linked IG account's ID: `GET /<PAGE_ID>?fields=instagram_business_account&access_token=<PAGE_ACCESS_TOKEN>`.
   Put that value in `IG_USER_ID` in `.env` (used to skip the account's own comments/replies).
5. Subscribe the IG account itself, same as the Page step above but against the IG account ID and `comments` field:
   ```
   curl -X POST "https://graph.facebook.com/v19.0/<IG_USER_ID>/subscribed_apps?subscribed_fields=comments&access_token=<PAGE_ACCESS_TOKEN>"
   ```

If comments don't get processed after this, set `DEBUG_WEBHOOK_PAYLOAD=true` in `.env`, redeploy, post a test IG
comment, and check the logs for the real payload shape — Instagram's `comments` field payload wasn't verified
against a live account when this was built, unlike the Facebook `feed` path, which needed exactly this kind of
live check to get right.

## How it works

- `GET /webhook` — one-time handshake Meta uses to verify the endpoint.
- `POST /webhook` — verified via `X-Hub-Signature-256` (HMAC-SHA256 over
  the raw body, keyed with `FB_APP_SECRET`) before anything else runs, so
  forged requests can't trigger deletions. The server acks with `200`
  immediately, then processes entries asynchronously — Meta expects a
  fast response and will retry/eventually unsubscribe if it's slow.
- Handles two change shapes: Facebook Page comments (`field === "feed"`,
  `item === "comment"`, `verb === "add"`) and Instagram comments
  (`field === "comments"`). For either, once the commenter isn't the
  Page/IG account itself, the comment text is fetched via
  `GET /{comment-id}?fields=message,text` (the webhook payload itself
  doesn't reliably include the comment text — only IDs and metadata) and
  sent to `gpt-4o-mini` with instructions to answer `DELETE` or `KEEP`.
  `DELETE` triggers a Graph API `DELETE` on the comment — the same
  endpoint pattern works for both Facebook and Instagram comment IDs.
- The moderation prompt currently deletes on hate speech/spam/toxicity
  **or any negative sentiment at all** (complaints, "I don't recommend
  this", mild criticism) — not just abuse. It also reads Arabic script
  and Darija/Arabizi (Latin-script Darija). Adjust the wording in
  `src/services/moderation.js` if that's more aggressive than intended —
  removing all negative feedback, not just abusive content, is a real
  product/reputation decision worth being deliberate about.
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
