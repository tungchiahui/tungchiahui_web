FROM groonga/pgroonga:4.0.8-alpine-18@sha256:b5c92fa3d86ad76ce75ddd8095f60542cf025348a58b8a38cd0b4a580fe4ce68 AS build

ARG PGBACKREST_SHA256=1cd522afc33b8ff846ef88c55dc238717c9c8817a4f6ca7c9f64887de9c7402d
ARG PGBACKREST_VERSION=2.59.1

RUN apk add --no-cache \
      bzip2-dev curl curl-dev gcc libc-dev libssh2-dev libxml2-dev linux-headers lz4-dev meson \
      openssl-dev libpq-dev zlib-dev zstd-dev \
  && curl --fail --location --silent --show-error --retry 3 --retry-all-errors --connect-timeout 15 --max-time 300 \
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

RUN apk add --no-cache \
      brotli-libs=1.2.1-r0 c-ares=1.34.9-r0 krb5-libs=1.22.3-r0 libbz2 \
      libcrypto3=3.5.9-r0 libcurl=8.23.0-r0 libpq libssh2=1.11.1-r4 \
      libssl3=3.5.9-r0 libuuid=2.42.3-r1 libxml2 libxslt=1.1.43-r4 lz4-libs \
      musl=1.2.6-r3 musl-utils=1.2.6-r3 nghttp2-libs=1.70.0-r0 zlib=1.4-r0 zstd-libs \
  && rm -f /usr/local/bin/gosu
COPY --from=build /tmp/pgbackrest-build/src/pgbackrest /usr/local/bin/pgbackrest

USER 70:70
