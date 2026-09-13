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
# Empty, not a URL: client.ts's request() already prefixes every call with
# "/api/...", and nginx.conf proxies that same-origin path straight to the
# api container - so the browser never needs an absolute API origin at all.
# Override at build time (docker build --build-arg VITE_API_URL=https://...)
# only if the API is ever served from a genuinely different origin than this
# web container's own.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY src/domain src/domain
COPY src/web src/web
RUN npx turbo run build --filter=@mou/web

FROM nginx:alpine AS runtime
COPY --from=build /app/src/web/dist /usr/share/nginx/html
COPY src/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
