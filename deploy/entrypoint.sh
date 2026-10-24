#!/bin/sh
# Hand the keystore volume to the unprivileged node user (volumes made by older
# images are root-owned), then run the engine as that user, never as root.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${KEYSTORE_DIR:-/data/keystore}"
  chown -R node:node /data "${KEYSTORE_DIR:-/data/keystore}"
  chmod 700 "${KEYSTORE_DIR:-/data/keystore}"
  exec runuser -u node -- "$@"
fi
exec "$@"
