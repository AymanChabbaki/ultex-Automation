# Deploying the Saas branch (Vercel + Neon)

This is a separate deployment from `DEPLOY.md` (which covers the VPS/Docker
setup for the `main` branch). This branch is multi-tenant: one deployment
serves every client, each added through the `/webhook/admin` screen rather
than being baked into `.env`.

## 1. Create the database (Neon)

1. [neon.tech](https://neon.tech) → New Project.
2. Copy the connection string from the dashboard (it looks like
   `postgres://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`).
   That's your `DATABASE_URL` -- keep it, you'll paste it into Vercel below.
3. Nothing else to do here -- the app creates its own tables (`clients`,
   `events`, `blocklist`) automatically on first request (`src/db.js`'s
   `migrate()`, idempotent `CREATE TABLE IF NOT EXISTS`).

## 2. Deploy to Vercel

1. [vercel.com](https://vercel.com) → Add New → Project → import the
   `ultex-Automation` repo.
2. **Important**: set the branch to deploy from to `Saas`, not `main`
   (Vercel's project settings → Git → Production Branch).
3. Framework preset: "Other" (this is a plain Express app via
   `api/index.js` + `vercel.json`, not Next.js).
4. Environment variables (Project Settings → Environment Variables) --
   same names as `.env.example`:
   - `DATABASE_URL` (from step 1)
   - `FB_VERIFY_TOKEN`
   - `FB_APP_SECRET`
   - `IG_APP_SECRET` (if using Instagram's separate login product)
   - `GRAPH_API_VERSION`
   - `OPENAI_API_KEY`, `OPENAI_MODEL`
   - `DASHBOARD_USER`, `DASHBOARD_PASSWORD`
   - Do **not** set `PORT` -- Vercel manages that itself.
5. Deploy. Vercel gives you a `*.vercel.app` URL immediately -- test with
   that before touching DNS.

## 3. Point comments.techermanos.org at it

1. Vercel project → Settings → Domains → add `comments.techermanos.org`.
2. Vercel shows you the exact DNS record to add (usually a `CNAME` to
   `cname.vercel-dns.com`, or an `A` record if it's an apex domain) --
   add that at your DNS provider for `techermanos.org`.
3. Wait for it to show "Valid Configuration" in Vercel before moving on
   (DNS propagation can take a few minutes to a few hours).

## 4. Verify it's actually working

```
curl https://comments.techermanos.org/health        # expect empty 200
curl https://comments.techermanos.org/demo            # expect the sandbox demo HTML
```

Then log into `https://comments.techermanos.org/webhook/admin` with
`DASHBOARD_USER`/`DASHBOARD_PASSWORD` and confirm the page loads (empty
client list is correct on a fresh deploy).

**Add one real or throwaway client through that screen and confirm it
shows up** -- this is the one thing I could not verify myself before
handing this off (no working Postgres to test against locally), so
treat this as the real first test of the Neon connection actually
working end-to-end.

## 5. Point Meta's webhook at the new URL

Same process as before, just a new Callback URL -- in the Meta App
Dashboard's Webhooks page:

```
Callback URL: https://comments.techermanos.org/webhook
Verify token: <same FB_VERIFY_TOKEN as in Vercel's env vars>
```

Every client's events flow through this one shared endpoint; the app
figures out which client an event belongs to from the Page/IG ID Meta
sends, using whatever's in the `clients` table.

## Notes

- This is a genuinely separate deployment/database from the VPS-hosted
  ULTEx instance on `main` -- nothing here migrates ULTEx's existing
  data automatically. If ULTEx should move onto this system, that's a
  separate step: re-add them as a client through `/webhook/admin`.
- The public `/demo` sandbox needs no setup at all -- it has no backend
  dependency, so it works the moment the deploy succeeds, independent
  of whether Neon/clients are configured yet.
