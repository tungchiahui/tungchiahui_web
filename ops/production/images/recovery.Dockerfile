FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS node-dependencies

RUN npm install --global pnpm@11.23.0 \
  && npm cache clean --force

WORKDIR /workspace
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node-dependencies AS node-build
COPY services ./services
COPY src ./src
COPY tsconfig.json ./
RUN mkdir -p /workspace/dist \
  && pnpm exec esbuild services/deploy-agent/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/deploy-agent.cjs \
  && pnpm exec esbuild services/recovery-drill/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/recovery-drill.cjs \
  && pnpm exec esbuild services/recovery-break-glass/main.ts --bundle --format=cjs --platform=node --target=node24 --outfile=dist/recovery-break-glass.cjs

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS pgbackrest-build

ARG PGBACKREST_SHA256=1cd522afc33b8ff846ef88c55dc238717c9c8817a4f6ca7c9f64887de9c7402d
ARG PGBACKREST_VERSION=2.59.1

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
      ca-certificates curl gcc libbz2-dev liblz4-dev libpq-dev libssh2-1-dev libssl-dev \
      libxml2-dev libzstd-dev meson ninja-build pkg-config zlib1g-dev \
  && curl --fail --location --silent --show-error \
      "https://github.com/pgbackrest/pgbackrest/releases/download/release%2F${PGBACKREST_VERSION}/pgbackrest-${PGBACKREST_VERSION}.tar.gz" \
      --output /tmp/pgbackrest.tar.gz \
  && echo "${PGBACKREST_SHA256}  /tmp/pgbackrest.tar.gz" | sha256sum --check --strict \
  && tar --extract --gzip --file /tmp/pgbackrest.tar.gz --directory /tmp \
  && meson setup /tmp/pgbackrest-build /tmp/pgbackrest-${PGBACKREST_VERSION} \
  && ninja -C /tmp/pgbackrest-build

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

ARG AGE_SHA256=bdc69c09cbdd6cf8b1f333d372a1f58247b3a33146406333e30c0f26e8f51377
ARG AGE_VERSION=1.3.1

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
      ca-certificates curl libbz2-1.0 liblz4-1 libpq5 libssh2-1 libxml2 libzstd1 zlib1g \
  && curl --fail --location --silent --show-error \
      "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-amd64.tar.gz" \
      --output /tmp/age.tar.gz \
  && echo "${AGE_SHA256}  /tmp/age.tar.gz" | sha256sum --check --strict \
  && tar --extract --gzip --file /tmp/age.tar.gz --strip-components=1 --directory /usr/local/bin "age/age" \
  && rm -rf /var/lib/apt/lists/* /tmp/age.tar.gz \
  && groupadd --gid 10050 site-runtime \
  && useradd --uid 70 --gid site-runtime --no-create-home --shell /usr/sbin/nologin recovery-agent

WORKDIR /app
COPY --from=pgbackrest-build /tmp/pgbackrest-build/src/pgbackrest /usr/local/bin/pgbackrest
COPY --from=node-build --chown=70:10050 /workspace/dist ./dist

USER 70:10050
CMD ["node", "dist/deploy-agent.cjs"]
