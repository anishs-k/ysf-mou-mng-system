# Purpose: Builds and runs @mou/api as a standalone container. The build
# context is the repo root (not src/api) because this is an npm-workspaces
# monorepo: `npm ci` must see every workspace's package.json to resolve the
# lockfile, and @mou/api depends on @mou/domain's build output. The runtime
# stage keeps the workspace-aware root node_modules (rather than pruning to a
# single package's dependencies) because npm workspaces symlinks every
# in-repo package into root node_modules regardless of which package.json
# declares the dependency - pruning it would silently break the
# @mou/domain import at a random point far from this file.
#
# Migrations and the admin/zone seed both run automatically on container start
# (docker-entrypoint.sh), so `docker compose up` alone is enough on a brand
# new machine - no separate `npm run db:migrate` step to remember.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY src/domain/package.json src/domain/package.json
COPY src/api/package.json src/api/package.json
COPY src/web/package.json src/web/package.json
COPY tests/e2e/package.json tests/e2e/package.json
# --ignore-scripts: none of these packages has an install-time script, and
# skipping npm's script phase here is a hardening default for third-party
# postinstall hooks in this dependency tree.
RUN npm ci --ignore-scripts

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY src/domain src/domain
COPY src/api src/api
# Builds @mou/domain first (turbo's dependsOn: ["^build"]), then @mou/api.
RUN npx turbo run build --filter=@mou/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src/domain/dist src/domain/dist
COPY src/domain/package.json src/domain/package.json
COPY --from=build /app/src/api/dist src/api/dist
# drizzle/ holds the generated SQL migrations - runMigrations() (db/migrate.ts)
# resolves this folder relative to its own compiled location at runtime.
COPY src/api/drizzle src/api/drizzle
COPY src/api/package.json src/api/package.json
COPY src/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/api/dist/index.js"]
