# Deploying to Railway

Two Docker-based services plus a managed Postgres, all in this one repo. Both
Dockerfiles were built and smoke-tested locally against the local Postgres
before being committed (migrations apply, `/health` responds, the SPA serves
and its client-side routes resolve).

- `Dockerfile.server` — Fastify API + Telegram bot (long polling). Runs
  `prisma migrate deploy` on every container start, then boots the server.
- `Dockerfile.admin-web` — builds the Vite SPA and serves the static `dist/`
  with `serve`. `VITE_API_URL` is baked into the JS bundle at **build**
  time — there is no runtime env var for a static SPA, so it must be set as
  a build-time variable on this service specifically.

## One-time setup (Railway dashboard — needs your account)

1. **New Project → Deploy from GitHub repo** → pick `englishacademyuz/english_academy_uz`.
2. **Add Postgres**: "+ New" → Database → PostgreSQL. Railway exposes its
   connection string as `${{Postgres.DATABASE_URL}}` for other services to
   reference.
3. **Server service**: "+ New" → GitHub Repo → same repo.
   - Settings → Build → set the config-as-code path to `railway.server.json`
     (or, if that field isn't available on your plan, manually set
     "Dockerfile Path" to `Dockerfile.server` under Build settings).
   - Settings → Variables:
     - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
     - `JWT_SECRET` = a long random string (**not** the `.env.example`
       placeholder — e.g. `openssl rand -hex 32`)
     - `TELEGRAM_BOT_TOKEN` = your bot's token from BotFather
     - `WEB_ORIGIN` = leave blank for now, set it after step 4
   - Settings → Networking → Generate Domain. Note the URL
     (`https://<server>.up.railway.app`).
4. **Admin-web service**: "+ New" → GitHub Repo → same repo.
   - Settings → Build → config-as-code path `railway.admin-web.json` (or
     manually set "Dockerfile Path" to `Dockerfile.admin-web`).
   - Settings → Variables → `VITE_API_URL` = the server's public URL from
     step 3 (this is a **build-time** variable — Railway passes service
     Variables as Docker build ARGs automatically for Dockerfile builds).
   - Settings → Networking → Generate Domain. Note this URL too.
5. **Back on the server service** → Variables → set `WEB_ORIGIN` to the
   admin-web URL from step 4 (comma-separate if you add more origins later),
   then redeploy the server service so CORS picks it up.
6. Both services already auto-deploy on every push to `main` once connected
   via GitHub — no extra Action or token needed for that part.

## What CI (`.github/workflows/ci.yml`) covers

Runs on every push/PR to `main`: install → generate Prisma client → migrate
a throwaway Postgres service container → typecheck → lint → test → build
admin-web. This is a quality gate, independent of Railway's own deploy
trigger — a red CI run doesn't block Railway's auto-deploy by itself unless
you turn on branch protection requiring it to pass before merging to `main`.

## Local parity

The same Dockerfiles work locally:

```
docker build -f Dockerfile.server -t server .
docker build -f Dockerfile.admin-web --build-arg VITE_API_URL=http://localhost:3000 -t admin-web .
```
