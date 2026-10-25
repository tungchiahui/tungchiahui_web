FROM percona/percona-pgbouncer:1.25.2-9@sha256:3558c3b79ef37989324616833d4763268d1ec171a10f3dec3b7d2c5da807b0be AS build
USER 0:0
# Keep the vendor's PgBouncer and its entrypoint contract; patch the vulnerable trust store.
RUN microdnf update --assumeyes ca-certificates \
  && microdnf clean all \
  && test "$(rpm -q --queryformat '%{VERSION}-%{RELEASE}' ca-certificates)" = "2026.2.92_v9.0.319-90.3.el9_8"

FROM build AS runtime
ARG SITE_DEPLOYMENT_SHA
LABEL org.opencontainers.image.revision=${SITE_DEPLOYMENT_SHA} \
  org.opencontainers.image.source="https://github.com/tungchiahui/tungchiahui_web"
USER 1001:1001
ENTRYPOINT ["/usr/bin/pgbouncer"]
CMD ["/etc/pgbouncer/pgbouncer.ini"]
