#!/bin/sh
# Purpose: Runs migrations and the idempotent zone/admin-user seed before the
# API starts serving, so `docker compose up` alone leaves a brand-new machine
# with a working login - no separate `npm run db:migrate`/`db:seed` step to
# remember. Both are safe to run on every container start: migrations only
# apply what is not already applied, and the seed only inserts a row that is
# missing. Set SKIP_DB_BOOTSTRAP=1 to opt out (e.g. a read replica, or a
# second API replica where only one instance should migrate).
#
# Runs the *compiled* dist/ output, not the TypeScript source - the runtime
# image (src/api/Dockerfile's final stage) only copies dist/, so this must
# not fall back to `--experimental-strip-types` against a source file that
# does not exist in this image. `set -e` means a real migration failure stops
# the container rather than silently starting the server against a
# half-migrated schema.
set -e

if [ "${SKIP_DB_BOOTSTRAP:-}" != "1" ]; then
  echo "Applying database migrations..."
  node /app/src/api/dist/db/migrate.js

  echo "Seeding zones and admin user (idempotent)..."
  node /app/src/api/dist/db/seed/index.js
fi

exec "$@"
