# Getting Started

This repo is an npm workspaces monorepo with two runnable apps:

- **`@tashkurgan/server`** — Fastify API + Telegram bot (`apps/server`)
- **`@tashkurgan/admin-web`** — React/Vite admin panel (`apps/admin-web`)

They share two internal packages (`packages/db`, `packages/domain`) that don't run on their own.

## Prerequisites

- Node.js 22+ ([nvm](https://github.com/nvm-sh/nvm) or [nvm-windows](https://github.com/coreybutler/nvm-windows) recommended)
- PostgreSQL 14+ running locally (or reachable via a connection string)

## 1. Install dependencies

From the repo root (installs every workspace at once):

```bash
npm install
```

## 2. Configure environment variables

Copy the example env files:

```bash
cp .env.example .env
cp apps/admin-web/.env.example apps/admin-web/.env
```

Open the root `.env` and adjust if needed:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tashkurgan?schema=public"
JWT_SECRET="change-me-in-production"
PORT=3000
TELEGRAM_BOT_TOKEN=""
```

- `DATABASE_URL` — must point at a Postgres database that already exists (create it first, e.g. `createdb tashkurgan`).
- `JWT_SECRET` — any random string for local dev.
- `TELEGRAM_BOT_TOKEN` — optional for local dev; leave blank if you're not testing the Telegram bot.

`apps/admin-web/.env` just needs to point at the API:

```bash
VITE_API_URL="http://localhost:3000"
```

## 3. Set up the database

The `db:*` scripts shell out to the Prisma CLI, which needs `DATABASE_URL` set in the environment (unlike the server's `dev`/`start` scripts, they don't load `.env` for you). Create the database, then export the variable and run migrate + seed, all from the repo root:

```bash
createdb tashkurgan   # skip if the database already exists

# macOS/Linux/Git Bash:
set -a && source .env && set +a
npm run db:migrate:deploy   # applies all Prisma migrations (creates tables)
npm run db:seed             # loads sample data: admin/teacher users, a subject, a group, students
```

On Windows PowerShell:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item "env:$($matches[1].Trim())" $matches[2].Trim('"') }
}
npm run db:migrate:deploy
npm run db:seed
```

This gives you:

| Role    | Username | Password       |
|---------|----------|----------------|
| Admin   | `admin`  | `admin12345`   |
| Teacher | `umid`   | `teacher12345` |

## 4. Run the apps

Open two terminals.

**Terminal 1 — API server (port 3000):**

```bash
npm run dev:server
```

**Terminal 2 — Admin web app (port 5173):**

```bash
cd apps/admin-web
npm run dev
```

Then open **http://localhost:5173** and log in with the admin credentials above.

## Everyday commands (from repo root)

```bash
npm run test        # run the full test suite (needs .env.test configured — see below)
npm run typecheck   # typecheck every workspace
npm run lint        # lint the whole repo
```

## Running tests

Tests use a separate database (config already checked in as `.env.test`, pointing at `tashkurgan_test`) so they never touch your dev data. First time only, create that database and apply migrations to it:

```bash
createdb tashkurgan_test
cd packages/db
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tashkurgan_test?schema=public" npx prisma migrate deploy
cd ../..
npm run test
```

On Windows PowerShell, replace the `DATABASE_URL=... npx ...` line with:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/tashkurgan_test?schema=public"
npx prisma migrate deploy
```

After that one-time setup, `npm run test` just works — it reads `.env.test` automatically.

## Troubleshooting

- **`Environment variable not found: DATABASE_URL`** when running `npm run db:migrate*`, `db:generate`, or `db:seed` — those Prisma-CLI-backed scripts need `DATABASE_URL` exported in the current shell (see step 3); only the server's own `dev`/`start` scripts load `.env` automatically.
- **`EPERM ... query_engine-windows.dll.node` (Windows, after a schema change)** — a running dev server is holding the Prisma engine file open. Stop the server (Terminal 1), run `db:generate` again, then restart it.
- **Port already in use** — another process is already using 3000 or 5173; stop it or change `PORT` / pass `--port` to Vite.
