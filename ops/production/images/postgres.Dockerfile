FROM groonga/pgroonga:4.0.8-alpine-18@sha256:b5c92fa3d86ad76ce75ddd8095f60542cf025348a58b8a38cd0b4a580fe4ce68 AS build

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

FROM groonga/pgroonga:4.0.8-alpine-18@sha256:b5c92fa3d86ad76ce75ddd8095f60542cf025348a58b8a38cd0b4a580fe4ce68
ARG SITE_DEPLOYMENT_SHA
LABEL org.opencontainers.image.revision=${SITE_DEPLOYMENT_SHA} \
  org.opencontainers.image.source="https://github.com/tungchiahui/tungchiahui_web"

RUN apk add --no-cache libbz2 libcrypto3 libpq libssh2 libxml2 lz4-libs zlib zstd-libs \
  && rm -f /usr/local/bin/gosu
COPY --from=build /tmp/pgbackrest-build/src/pgbackrest /usr/local/bin/pgbackrest

USER 70:70
