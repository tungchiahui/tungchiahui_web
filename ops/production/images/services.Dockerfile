FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS dependencies

RUN npm install --global pnpm@11.23.0 \
  && npm cache clean --force

WORKDIR /workspace
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY services ./services
COPY ops/database/roles.sql ./ops/database/roles.sql
COPY src ./src
COPY tsconfig.json ./
RUN mkdir -p /workspace/dist \
  && pnpm exec esbuild services/control-api/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/control-api.cjs \
  && pnpm exec esbuild services/content-worker/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/content-worker.cjs \
  && pnpm exec esbuild services/deploy-agent/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/deploy-agent.cjs \
  && pnpm exec esbuild services/database-role-bootstrap/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/database-role-bootstrap.cjs \
  && mkdir -p dist/bootstrap \
  && cp ops/database/roles.sql dist/bootstrap/roles.sql

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime
ENV NODE_ENV=production

RUN groupadd --gid 10050 site-runtime \
  && useradd --uid 10001 --gid site-runtime --no-create-home --shell /usr/sbin/nologin service

WORKDIR /app
COPY --from=build --chown=10001:10050 /workspace/dist ./dist

USER 10001:10050
CMD ["node", "dist/control-api.cjs"]
