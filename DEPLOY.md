# Deploying to workflow.ultex.ma

Runs as its own standalone container (not part of the `ultex_workflow`
compose stack), reachable through the existing `nginx-proxy` container at
`https://workflow.ultex.ma/fb-webhook/`. This mirrors how `folders.ultex.ma`
reaches its Node app on `172.17.0.1:3050` — nginx proxies to a container
port published on the host.

Host port `3100` is used below since 3000/3050/4040/5050/5432-5434/6379/8080
are already taken by other containers on this box. Deployed path on the
VPS: `/home/ultex/ultex-Automation`.

## 1. Get the code onto the VPS

```
ssh root@ultexserver
git clone https://github.com/AymanChabbaki/ultex-Automation
cd ultex-Automation
```

For later updates: `git pull` from this directory, then rebuild (see
"Redeploying after code changes" below).

## 2. Create the env file on the server

```
cp .env.example .env
nano .env
```

Fill in `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `PAGE_ACCESS_TOKEN`, `PAGE_ID`,
`OPENAI_API_KEY`, and (for the dashboard) `DASHBOARD_USER`/`DASHBOARD_PASSWORD`.

`.env` never gets baked into the image — it's passed at container run
time with `--env-file`, so redeploying the image doesn't require rebuilding
secrets in. It's also gitignored, so it never leaves the server via `git push`.

## 3. Build and run the container

The `-v .../data:/app/data` mount is what makes the moderation dashboard's
history survive `docker rm` + `docker run` on every redeploy — without it,
`/app/data` is just container-local storage that's wiped every time.

```
cd /home/ultex/ultex-Automation
docker build -t fb-comment-moderator .
docker run -d \
  --name fb-comment-moderator \
  --restart unless-stopped \
  --env-file .env \
  -v /home/ultex/ultex-Automation/data:/app/data \
  -p 3100:3000 \
  fb-comment-moderator
```

Verify it's up:

```
docker ps --filter name=fb-comment-moderator
curl -s http://localhost:3100/health   # expect empty 200
docker logs -f fb-comment-moderator    # should show "Listening on port 3000" with no warnings
```

## 4. Add the nginx route

Edit `infra/nginx-prod.conf` and add a new `location` block inside the
**same `server { listen 80; server_name _; ... }` block** that already
has `/api/`, `/api/v1/`, `/webhook/`, and `/` — that's the block serving
`workflow.ultex.ma`.

Use a regex location, not a plain prefix one — Meta's actual webhook
delivery POSTs to `/fb-webhook` **without** a trailing slash, which a
`location /fb-webhook/ { ... }` block silently fails to match (the
request falls through to the catch-all `/` block instead and never
reaches the app):

```nginx
    # Route FB comment-moderator webhook traffic to its standalone container
    location ~ ^/fb-webhook(/.*)?$ {
        rewrite ^/fb-webhook(.*)$ /webhook$1 break;
        proxy_pass http://172.17.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

This matches `/fb-webhook`, `/fb-webhook/`, and any sub-path (e.g.
`/fb-webhook/dashboard`), rewriting each to the equivalent `/webhook/...`
path the app actually serves.

Then reload nginx (this is the `ultex_workflow-nginx-proxy-1` container):

```
docker exec ultex_workflow-nginx-proxy-1 nginx -t
docker exec ultex_workflow-nginx-proxy-1 nginx -s reload
```

`nginx -t` first so a config typo doesn't take down everything else this
proxy serves (crm.ultex.ma, folders.ultex.ma, the admin dashboard) —
don't reload if it reports an error.

## 5. Point Meta at it

In the Meta App Dashboard webhook config, use:

```
Callback URL: https://workflow.ultex.ma/fb-webhook
Verify token: <same value as FB_VERIFY_TOKEN in .env>
```

Subscribe the app to the `feed` field. Then — this step is easy to miss
and doesn't happen automatically from the App Dashboard toggle — subscribe
the **Page itself** to send events to the app, using the Page Access Token:

```
curl -s -X POST "https://graph.facebook.com/v19.0/<PAGE_ID>/subscribed_apps?subscribed_fields=feed&access_token=<PAGE_ACCESS_TOKEN>"
```

Expect `{"success":true}`. Verify with:

```
curl -s "https://graph.facebook.com/v19.0/<PAGE_ID>/subscribed_apps?access_token=<PAGE_ACCESS_TOKEN>"
```

`data` should be non-empty. The Page Access Token needs the
`pages_manage_metadata` scope for this call to succeed, in addition to
`pages_manage_engagement` and `pages_read_user_content` needed for
deleting comments — see the README for how to generate that token via
Graph API Explorer + `/me/accounts`.

## 6. Moderation dashboard

Once `DASHBOARD_USER`/`DASHBOARD_PASSWORD` are set in `.env`:

```
https://workflow.ultex.ma/fb-webhook/dashboard
```

HTTP Basic Auth prompt, then a live view of recent moderation decisions
(kept/deleted/errors) that auto-refreshes. Backed by `data/events.jsonl`
on the host (see the volume mount in step 3) — history survives redeploys
as long as that mount stays in place.

## Redeploying after code changes

```
cd /home/ultex/ultex-Automation
git pull
docker build -t fb-comment-moderator .
docker rm -f fb-comment-moderator
docker run -d \
  --name fb-comment-moderator \
  --restart unless-stopped \
  --env-file .env \
  -v /home/ultex/ultex-Automation/data:/app/data \
  -p 3100:3000 \
  fb-comment-moderator
```
