FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS build

RUN npm install --global pnpm@11.23.0 \
  && npm cache clean --force

WORKDIR /workspace
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./tsconfig.json
RUN pnpm install --frozen-lockfile
COPY tools/infra ./tools/infra
COPY tools/control ./tools/control
COPY tools/dev/control-auth-fixture.ts ./tools/dev/control-auth-fixture.ts
COPY src ./src
RUN pnpm exec esbuild tools/infra/test-production-foundation.ts --bundle --format=cjs --platform=node --target=node24 --outfile=/runner.cjs
RUN pnpm exec esbuild tools/infra/test-recovery.ts --bundle --format=cjs --platform=node --target=node24 --outfile=/recovery-runner.cjs

FROM python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2

ARG AGE_SHA256=bdc69c09cbdd6cf8b1f333d372a1f58247b3a33146406333e30c0f26e8f51377
ARG AGE_VERSION=1.3.1
ARG COMPOSE_SHA256=837fd1d35bf6a494f41b5b5988269a7be79de337cf1a1a6ff0e45ab51bb4e9be
ARG COMPOSE_VERSION=5.4.0
ARG SOPS_SHA256=e5bec3346a873ae91d871550f3e698c1aad962aff462a080e40f25fde17fef6b
ARG SOPS_VERSION=3.13.3

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl docker.io openssl \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir ansible-core==2.21.3 \
  && mkdir -p /usr/local/libexec/docker/cli-plugins \
  && curl --fail --location --silent --show-error \
    "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    --output /tmp/docker-compose \
  && echo "${COMPOSE_SHA256}  /tmp/docker-compose" | sha256sum --check --strict \
  && install -m 0755 /tmp/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose \
  && curl --fail --location --silent --show-error \
    "https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.amd64" \
    --output /tmp/sops \
  && echo "${SOPS_SHA256}  /tmp/sops" | sha256sum --check --strict \
  && install -m 0755 /tmp/sops /usr/local/bin/sops \
  && curl --fail --location --silent --show-error \
    "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-amd64.tar.gz" \
    --output /tmp/age.tar.gz \
  && echo "${AGE_SHA256}  /tmp/age.tar.gz" | sha256sum --check --strict \
  && tar --extract --gzip --file /tmp/age.tar.gz --strip-components=1 --directory /usr/local/bin \
    "age/age" "age/age-keygen" \
  && rm -f /tmp/docker-compose /tmp/sops /tmp/age.tar.gz

COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /runner.cjs /runner.cjs
COPY --from=build /recovery-runner.cjs /recovery-runner.cjs

ENTRYPOINT ["node", "/runner.cjs"]
