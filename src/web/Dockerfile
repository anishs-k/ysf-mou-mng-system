# Purpose: Builds @mou/web into a static bundle and serves it with nginx. The
# build context is the repo root (see src/api/Dockerfile's own note) because
# this is an npm-workspaces monorepo and @mou/web depends on @mou/domain's
# build output. VITE_API_URL is a build ARG, not a runtime env var, because
# Vite inlines import.meta.env.* into the bundle at build time - changing it
# later means rebuilding this image, not just restarting the container.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY src/domain/package.json src/domain/package.json
COPY src/api/package.json src/api/package.json
COPY src/web/package.json src/web/package.json
COPY tests/e2e/package.json tests/e2e/package.json
RUN npm ci --ignore-scripts

FROM node:24-alpine AS build
WORKDIR /app
# Defaults to empty, which is what docker-compose wants: client.ts's request()
# already prefixes every call with "/api/...", and the nginx proxy (see the
# runtime stage) forwards that same-origin path to the api container, so the
# browser never needs an absolute API origin.
#
# Railway is the opposite case and MUST override this
# (--build-arg VITE_API_URL=https://<api-service>.up.railway.app), because
# there web and api are separate services with no shared origin to proxy
# across. Vite inlines the value at build time, so changing it means
# rebuilding the image, not just restarting the container.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY src/domain src/domain
COPY src/web src/web
RUN npx turbo run build --filter=@mou/web

FROM nginx:alpine AS runtime
COPY --from=build /app/src/web/dist /usr/share/nginx/html

# Templates in /etc/nginx/templates are rendered with envsubst by the stock
# nginx:alpine entrypoint at container start, so NGINX_PORT can vary per
# deployment (Railway assigns a random $PORT the container must listen on;
# docker-compose keeps 80 and maps its own host port to it).
COPY src/web/nginx.conf.template /etc/nginx/templates/default.conf.template

# Resolves NGINX_PORT from Railway's own $PORT (falling back to NGINX_PORT,
# then 80) BEFORE nginx's own entrypoint renders the template above - a
# .envsh file, not .sh, because only a *sourced* script's exports survive
# into the later envsubst step; see the file's own header for why.
COPY src/web/05-set-port.envsh /docker-entrypoint.d/05-set-port.envsh
RUN chmod +x /docker-entrypoint.d/05-set-port.envsh

# The /api/ proxy block, generated at start-up only when API_UPSTREAM is set.
# The empty default guarantees the template's `include` always resolves, even
# on the very first start before the script has run.
COPY src/web/20-api-proxy.sh /docker-entrypoint.d/20-api-proxy.sh
RUN chmod +x /docker-entrypoint.d/20-api-proxy.sh && touch /etc/nginx/api-proxy.conf

# Only envsubst'd variables need defaults here; API_UPSTREAM is deliberately
# unset (Railway's shape). docker-compose.yml sets it explicitly. Railway
# ignores EXPOSE and routes to its own assigned $PORT regardless (resolved by
# 05-set-port.envsh above), so this is accurate for docker-compose only.
ENV NGINX_PORT=80
EXPOSE 80
