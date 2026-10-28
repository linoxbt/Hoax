#!/usr/bin/env bash
# Nightly Postgres dump for the Hoax engines. vps-setup.sh installs it as a root
# cron job. Dumps go to deploy/backups (mode 700), gzipped; the last 14 are kept.
# Restore: gunzip -c deploy/backups/hoax-<stamp>.sql.gz | docker compose exec -T db psql -U hoax -d hoax
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP=${KEEP:-14}
mkdir -p deploy/backups
chmod 700 deploy/backups
out="deploy/backups/hoax-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
# The dump runs over the container's socket, which pg_hba trusts: no password leaves .env.
docker compose exec -T db pg_dump -U hoax -d hoax --clean --if-exists | gzip -9 > "$out.part"
mv "$out.part" "$out"
chmod 600 "$out"
ls -1t deploy/backups/hoax-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "backup written: $out"
