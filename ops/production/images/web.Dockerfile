FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS dependencies

RUN npm install --global pnpm@11.23.0 \
  && npm cache clean --force

WORKDIR /workspace
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG SITE_DEPLOYMENT_SHA
ENV NEXT_TELEMETRY_DISABLED=1 \
  SITE_BASE_URL=https://www.tungchiahui.cn \
  SITE_DEPLOYMENT_SHA=${SITE_DEPLOYMENT_SHA}

COPY . .
RUN pnpm build

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime
ARG SITE_DEPLOYMENT_SHA
ENV HOSTNAME=0.0.0.0 \
  NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  SITE_DEPLOYMENT_SHA=${SITE_DEPLOYMENT_SHA}

RUN groupadd --gid 10001 site \
  && useradd --uid 10001 --gid site --no-create-home --shell /usr/sbin/nologin site

WORKDIR /app
COPY --from=build --chown=site:site /workspace/.next/standalone ./
COPY --from=build --chown=site:site /workspace/.next/static ./.next/static
COPY --from=build --chown=site:site /workspace/public ./public

USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
