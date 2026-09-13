#!/bin/sh
# Purpose: Writes the /api/ reverse-proxy `location` block that
# nginx.conf.template includes, but only fills it in when API_UPSTREAM is set,
# because the two deployments this image supports genuinely differ:
#
#   * docker-compose (docs/devenv.md) sets API_UPSTREAM=http://api:3001. The
#     browser then talks to a single origin and nginx forwards /api/ to the
#     api container over the compose network, which is what keeps the session
#     cookie same-origin (sameSite=lax) with no CORS hop.
#   * Railway leaves API_UPSTREAM unset. Each service is separately
#     addressable and no compose-network hostname like `api` exists, so
#     proxying is impossible - the browser calls the API's own public URL,
#     baked into the bundle at build time as VITE_API_URL.
#
# Dropped into /docker-entrypoint.d/, which the stock nginx:alpine entrypoint
# runs in filename order before starting nginx. The 20- prefix puts it after
# that entrypoint's own 20-envsubst-on-templates.sh has already rendered
# nginx.conf.template, so the file this writes must exist by then - the
# Dockerfile therefore also ships an empty default copy, and this script only
# ever overwrites it.
#
# Writing an empty file rather than skipping matters: a stale proxy snippet
# from a previous run would otherwise point at a now-unreachable upstream.
set -e

PROXY_SNIPPET=/etc/nginx/api-proxy.conf

if [ -z "${API_UPSTREAM:-}" ]; then
  : > "$PROXY_SNIPPET"
  echo "20-api-proxy.sh: API_UPSTREAM not set - serving static files only, no /api proxy."
  exit 0
fi

echo "20-api-proxy.sh: proxying /api/ to ${API_UPSTREAM}/api/"

cat > "$PROXY_SNIPPET" <<EOF
location /api/ {
    proxy_pass ${API_UPSTREAM}/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}
EOF
