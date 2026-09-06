FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS dependencies

RUN npm install --global pnpm@11.23.0 \
  && npm cache clean --force

WORKDIR /workspace
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY services ./services
COPY drizzle ./drizzle
COPY ops/database/roles.sql ./ops/database/roles.sql
COPY ops/database/runtime-grants.sql ./ops/database/runtime-grants.sql
COPY src ./src
COPY tsconfig.json ./
RUN mkdir -p /workspace/dist \
  && pnpm exec esbuild services/control-api/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/control-api.cjs \
  && pnpm exec esbuild services/content-worker/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/content-worker.cjs \
  && pnpm exec esbuild services/observability-agent/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/observability-agent.cjs \
  && pnpm exec esbuild services/deploy-agent/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/deploy-agent.cjs \
  && pnpm exec esbuild services/database-migrate/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/database-migrate.cjs \
  && pnpm exec esbuild services/database-role-bootstrap/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/database-role-bootstrap.cjs \
  && mkdir -p dist/bootstrap \
  && cp ops/database/roles.sql dist/bootstrap/roles.sql \
  && mkdir -p deployment/ops/database \
  && cp -R drizzle deployment/drizzle \
  && cp ops/database/roles.sql deployment/ops/database/roles.sql \
  && cp ops/database/runtime-grants.sql deployment/ops/database/runtime-grants.sql

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS runtime
ARG SITE_DEPLOYMENT_SHA
LABEL org.opencontainers.image.revision=${SITE_DEPLOYMENT_SHA} \
  org.opencontainers.image.source="https://github.com/tungchiahui/tungchiahui_web"
ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -g 10050 -S site-runtime \
  && adduser -u 10001 -G site-runtime -D -H -s /sbin/nologin service

WORKDIR /app
COPY --from=build --chown=10001:10050 /workspace/dist ./dist
COPY --from=build --chown=10001:10050 /workspace/deployment ./deployment

USER 10001:10050
CMD ["node", "dist/control-api.cjs"]
