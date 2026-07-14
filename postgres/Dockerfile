# Official postgres:15-alpine ships a static Go `gosu` binary carrying Go-stdlib
# CVEs (e.g. CVE-2025-68121) that upstream hasn't rebuilt away. gosu is only
# used by the entrypoint to drop root->postgres; alpine's su-exec (tiny C binary,
# identical `USER cmd...` CLI) does the same job with no Go.
#
# Overwriting gosu in a second layer isn't enough: trivy's image scan still finds
# the Go binary in the base layer. So we flatten the whole rootfs into a single
# `FROM scratch` layer where gosu is already the C su-exec — nothing for trivy to
# find underneath.
FROM postgres:15-alpine AS base
RUN apk add --no-cache su-exec \
 && cp /sbin/su-exec /usr/local/bin/gosu

FROM scratch
COPY --from=base / /

# Metadata reconstructed from the official image (scratch keeps none of it).
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=en_US.utf8 \
    PG_MAJOR=15 \
    PG_VERSION=15.18 \
    PGDATA=/var/lib/postgresql/data
EXPOSE 5432
VOLUME /var/lib/postgresql/data
STOPSIGNAL SIGINT
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres"]
