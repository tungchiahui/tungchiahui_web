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

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS runtime
ARG SITE_DEPLOYMENT_SHA
LABEL org.opencontainers.image.revision=${SITE_DEPLOYMENT_SHA} \
  org.opencontainers.image.source="https://github.com/tungchiahui/tungchiahui_web"
ENV HOSTNAME=0.0.0.0 \
  NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  SITE_DEPLOYMENT_SHA=${SITE_DEPLOYMENT_SHA}

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -g 10001 -S site \
  && adduser -u 10001 -G site -D -H -s /sbin/nologin site

WORKDIR /app
COPY --from=build --chown=site:site /workspace/.next/standalone ./
COPY --from=build --chown=site:site /workspace/.next/static ./.next/static
COPY --from=build --chown=site:site /workspace/public ./public

USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
