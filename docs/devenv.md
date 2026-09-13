# MOU management system Development Environment Setup

Use this checklist for onboarding a new developer:

1. Review the tech stack in `docs/design/ARCHITECTURE.md`.
2. Verify required tools are installed (compiler/interpreter/build tools/dependencies).
3. If anything is missing:
   - Ask whether it is already installed and where.
   - If not installed, guide setup of required software and packages.
4. Create `environment.ps1` (Windows PowerShell), `environment.bat` (Windows cmd)
   or `environment.sh` (Unix) in the project root. `environment.ps1` and
   `environment.sh` already exist; all three are gitignored.
5. Ensure the environment file:
   - Adds required tool paths (e.g compiler, build tool, testing tools).
   - Sets required environment variables.
   - Defines repository paths (root, source, test).
   - Includes any stack-specific best practices.
6. Do not commit the environment file; add it to version control ignore rules.

## Running the app

The environment file must be **sourced into the current shell**, not executed as a
child process, or the variables it sets vanish with its own scope:

```powershell
# PowerShell - note the leading dot
. .\environment.ps1
npm run dev
```

```bash
# bash / Git Bash
source ./environment.sh && npm run dev
```

`npm run dev` is `turbo run dev`, which boots the API on port 3001 and the web
frontend on port 5173 together. Without the sourced environment the API exits
immediately with `DATABASE_URL must be set`, while Vite still starts - a half-up
stack that looks like it is working.

Docker Desktop must be running: Postgres lives in a container on host port 5434.

## Database

Three commands, in this order, on a fresh checkout:

```bash
source ./environment.sh
npm run db:up       # docker-compose, only if the container is not already running
npm run db:migrate  # applies everything in src/api/drizzle
npm run db:seed     # zone master (24 rows) + the ADMIN user
```

`db:seed` is idempotent and holds only the reference data the application cannot
run without.

### Demo data

```bash
npm run db:seed:demo
```

Inserts 65 companies and 120 MOUs across 19 zones and 6 schemes (SPEC-16 section
6, Phase E) so the dashboards, search, exports and expiry alerts have something
realistic to render. It is **not** part of `db:seed`, is referenced by no
migration and no CI job, and is idempotent - a second run inserts nothing.

Every value is synthetic by design: TAN and GST numbers carry a `DEMO` prefix and
the emails use the reserved `.invalid` top-level domain, so no seeded row can be
mistaken for a real company or receive mail. Do not restore this data anywhere
that matters. It requires `db:migrate` and `db:seed` to have run first, because it
references the zone master and the ADMIN user.

## Run everything via Docker

The path above (`npm run dev` + `npm run db:*`) is for active development, where
you want hot-reload on both the API and the web app. If you only want to _run_
the whole application - on your own machine or someone else's, with nothing
installed beyond Docker - three containers built from this repo do the whole
job: `postgres` (unchanged from the section above), `api` and `web`.

```bash
cp .env.example .env   # then set a real ADMIN_PASSWORD
docker compose up -d --build
```

That's the entire setup. No local Node.js, no `npm install`, no `db:migrate`/
`db:seed` step to remember - the `api` container's entrypoint
(`src/api/docker-entrypoint.sh`) applies migrations and runs the idempotent
zone/admin seed itself, every time it starts, before it begins serving.

Once the containers report healthy/started:

- **Web app**: `http://localhost:8080` (override with `MOU_WEB_PORT` in `.env`
  if 8080 is already taken - `docker compose up` will otherwise fail with
  "port is already allocated").
- **API directly** (e.g. for `curl`/Postman): `http://localhost:3001` (override
  with `MOU_API_PORT`).
- Log in with `ADMIN_USERNAME`/`ADMIN_PASSWORD` from your `.env` (`admin` /
  whatever you set `ADMIN_PASSWORD` to - the default `change-me` in
  `.env.example` works for local testing but must never be used anywhere
  reachable by anyone else).

Useful commands:

```bash
docker compose logs -f api        # follow the api's own migration/seed/startup log
docker compose down               # stop everything, keep the database volume
docker compose down -v            # stop everything AND delete the database + uploads volumes
docker compose build api web      # rebuild after pulling code changes, without restarting postgres
```

### What each container actually is

- `postgres` - unchanged; the same `postgres:15-alpine` image the local-Node
  path already uses, just no longer needing a developer to have run
  `npm run db:up` themselves.
- `api` (`src/api/Dockerfile`) - a multi-stage build: `npm ci` across the whole
  npm-workspaces graph, `turbo run build --filter=@mou/api` (which also builds
  `@mou/domain` first, since `@mou/api` depends on its compiled output), then a
  slim runtime image that only carries the two packages' `dist/` output plus
  the generated SQL migrations. Uploaded MOU PDFs and generated exports live on
  the named volume `uploads_data` (`/app/uploads` inside the container), so
  they survive `docker compose down` (but not `down -v`).
- `web` (`src/web/Dockerfile`) - the same build-then-slim pattern, but the
  final stage is `nginx:alpine` serving the static Vite build
  (`src/web/nginx.conf` also reverse-proxies `/api/` to the `api` container, so
  the browser only ever talks to one origin - no second CORS hop).

### DATABASE_URL differs from the local-Node path - this is intentional

`docker-compose.yml` sets the `api` container's own `DATABASE_URL` directly
(`postgresql://postgres:postgres@postgres:5432/mou_mng_system`), which is
**not** the same value as `.env.example`'s `DATABASE_URL`
(`...@localhost:5434/...`). The container reaches Postgres over the Docker
network by the service's name (`postgres`) and Postgres's own in-container port
(`5432`); the value in `.env.example` is for a developer running `@mou/api`
directly on the host, reaching the same Postgres through the port
docker-compose publishes to the host (`5434`). Only
`ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` and `WEB_ORIGIN` are shared
between the two paths, read by docker-compose from your `.env` file.
