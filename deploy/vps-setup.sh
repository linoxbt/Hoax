#!/usr/bin/env bash
# Set up the Hoax watcher and its Postgres on a fresh Ubuntu/Debian VPS.
# Run as root (or with sudo):  bash vps-setup.sh
# Safe to run again: it keeps an existing .env and only rebuilds.
set -euo pipefail

REPO=https://github.com/linoxbt/Hoax.git
BRANCH=${BRANCH:-ccr-401058ee-123g91}
DIR=${DIR:-/opt/hoax}

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null 2>&1 || (apt-get update -y && apt-get install -y git)

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" checkout "$BRANCH" && git -C "$DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  umask 077
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
HOAX_KEYSTORE_SECRET=$(openssl rand -hex 32)
POSTGRES_PUBLIC_PORT=5432
# Optional: a funded key that tops up Hoax keys with STT for gas.
GAS_WALLET_PRIVATE_KEY=
HOAX_BUILDER_ADDRESS=
HOAX_BUILDER_FEE_BPS_1K=0
DRY_RUN=false
ENV
  echo "Wrote $DIR/.env with fresh secrets. Back it up: losing HOAX_KEYSTORE_SECRET loses the Hoax keys."
fi

docker compose up -d --build

# Open the ports if ufw is active: 8080 health endpoint, Postgres for Netlify.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 8080/tcp
  ufw allow "$(grep POSTGRES_PUBLIC_PORT .env | cut -d= -f2)"/tcp
fi

echo "Waiting for the watcher..."
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://localhost:8080/healthz && echo

IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
PASS=$(grep POSTGRES_PASSWORD .env | cut -d= -f2)
PORT=$(grep POSTGRES_PUBLIC_PORT .env | cut -d= -f2)
echo
echo "Watcher health:  http://$IP:8080/healthz"
echo "Set this on Netlify as DATABASE_URL (keep it secret):"
echo "  postgres://hoax:$PASS@$IP:$PORT/hoax"
