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
