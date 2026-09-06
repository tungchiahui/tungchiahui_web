FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS node-dependencies

RUN npm install --global pnpm@11.23.0 \
  && npm cache clean --force

WORKDIR /workspace
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node-dependencies AS node-build
COPY services ./services
COPY drizzle/migration-policy.json ./drizzle/migration-policy.json
COPY drizzle/meta/_journal.json ./drizzle/meta/_journal.json
COPY src ./src
COPY tsconfig.json ./
RUN mkdir -p /workspace/dist \
  && pnpm exec esbuild services/deploy-agent/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/deploy-agent.cjs \
  && pnpm exec esbuild services/recovery-drill/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/recovery-drill.cjs \
  && pnpm exec esbuild services/recovery-break-glass/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/recovery-break-glass.cjs

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS pgbackrest-build

ARG PGBACKREST_SHA256=1cd522afc33b8ff846ef88c55dc238717c9c8817a4f6ca7c9f64887de9c7402d
ARG PGBACKREST_VERSION=2.59.1

RUN apk add --no-cache \
      bzip2-dev curl curl-dev gcc libc-dev libssh2-dev libxml2-dev linux-headers lz4-dev meson \
      openssl-dev postgresql-dev zlib-dev zstd-dev \
  && curl --fail --location --silent --show-error \
      "https://github.com/pgbackrest/pgbackrest/releases/download/release%2F${PGBACKREST_VERSION}/pgbackrest-${PGBACKREST_VERSION}.tar.gz" \
      --output /tmp/pgbackrest.tar.gz \
  && echo "${PGBACKREST_SHA256}  /tmp/pgbackrest.tar.gz" | sha256sum -c \
  && tar --extract --gzip --file /tmp/pgbackrest.tar.gz --directory /tmp \
  && meson setup /tmp/pgbackrest-build /tmp/pgbackrest-${PGBACKREST_VERSION} \
  && ninja -C /tmp/pgbackrest-build

FROM golang:1.25.7-alpine3.23@sha256:f6751d823c26342f9506c03797d2527668d095b0a15f1862cddb4d927a7a4ced AS age-build

ARG AGE_VERSION=1.3.2

RUN CGO_ENABLED=0 GOBIN=/out go install filippo.io/age/cmd/age@v${AGE_VERSION}

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS runtime
ARG SITE_DEPLOYMENT_SHA
LABEL org.opencontainers.image.revision=${SITE_DEPLOYMENT_SHA} \
  org.opencontainers.image.source="https://github.com/tungchiahui/tungchiahui_web"

RUN apk add --no-cache ca-certificates libbz2 libcrypto3 libpq libssh2 libxml2 lz4-libs zlib zstd-libs \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && addgroup -g 10050 -S site-runtime \
  && adduser -u 70 -G site-runtime -D -H -s /sbin/nologin recovery-agent

WORKDIR /app
COPY --from=age-build /out/age /usr/local/bin/age
COPY --from=pgbackrest-build /tmp/pgbackrest-build/src/pgbackrest /usr/local/bin/pgbackrest
COPY --from=node-build --chown=70:10050 /workspace/dist ./dist
COPY --from=node-build --chown=70:10050 /workspace/drizzle ./deployment/drizzle

USER 70:10050
CMD ["node", "dist/deploy-agent.cjs"]
