# Deploying to workflow.ultex.ma

Runs as its own standalone container (not part of the `ultex_workflow`
compose stack), reachable through the existing `nginx-proxy` container at
`https://workflow.ultex.ma/fb-webhook/`. This mirrors how `folders.ultex.ma`
reaches its Node app on `172.17.0.1:3050` — nginx proxies to a container
port published on the host.

Host port `3100` is used below since 3000/3050/4040/5050/5432-5434/6379/8080
are already taken by other containers on this box.

## 1. Get the code onto the VPS

From your machine, copy the project to the server (adjust the path to
however you normally get code onto this box — `git push` to a repo you
pull from, or `scp`):

```
scp -r "c:/Users/ultex gm/Desktop/ultex Automation" root@ultexserver:/home/ultex/fb-comment-moderator
```

## 2. Create the env file on the server

```
ssh root@ultexserver
cd /home/ultex/fb-comment-moderator
cp .env.example .env
nano .env   # fill in FB_VERIFY_TOKEN, FB_APP_SECRET, PAGE_ACCESS_TOKEN, PAGE_ID, OPENAI_API_KEY
```

`.env` never gets baked into the image — it's passed at container run
time with `--env-file`, so redeploying the image doesn't require rebuilding
secrets in.

## 3. Build and run the container

```
cd /home/ultex/fb-comment-moderator
docker build -t fb-comment-moderator .
docker run -d \
  --name fb-comment-moderator \
  --restart unless-stopped \
  --env-file .env \
  -p 3100:3000 \
  fb-comment-moderator
```

Verify it's up:

```
docker ps --filter name=fb-comment-moderator
curl -s http://localhost:3100/health   # expect empty 200
```

## 4. Add the nginx route

Edit `infra/nginx-prod.conf` and add a new `location` block inside the
**same `server { listen 80; server_name _; ... }` block** that already
has `/api/`, `/api/v1/`, `/webhook/`, and `/` — that's the block serving
`workflow.ultex.ma`. Add this alongside the existing `location /webhook/`
block (order doesn't matter for nginx prefix matching, but keeping it
nearby keeps the file readable):

```nginx
    # Route FB comment-moderator webhook traffic to its standalone container
    location /fb-webhook/ {
        proxy_pass http://172.17.0.1:3100/webhook/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

The trailing slash on both the `location` path and the `proxy_pass` URL
matters — it's what makes nginx rewrite `/fb-webhook/anything` to
`/webhook/anything` before forwarding, the same pattern already used for
`/webhook/` → `/api/v1/webhook/` in that file.

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
Callback URL: https://workflow.ultex.ma/fb-webhook/
Verify token: <same value as FB_VERIFY_TOKEN in .env>
```

Meta requires HTTPS here — since `workflow.ultex.ma` is already serving
HTTPS for the rest of the app, this should work with no extra cert setup.
Trigger the verification from the dashboard and confirm it goes green.

## Redeploying after code changes

```
cd /home/ultex/fb-comment-moderator
docker build -t fb-comment-moderator .
docker rm -f fb-comment-moderator
docker run -d --name fb-comment-moderator --restart unless-stopped \
  --env-file .env -p 3100:3000 fb-comment-moderator
```
