#!/usr/bin/env bash
# Set up the Hoax watcher and its Postgres on a fresh Ubuntu/Debian VPS.
# Run as root (or with sudo):  bash vps-setup.sh
# Safe to run again: it keeps an existing .env and only rebuilds.
set -euo pipefail

REPO=https://github.com/linoxbt/Hoax.git
BRANCH=${BRANCH:-main}
DIR=${DIR:-/opt/hoax}

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null 2>&1 || (apt-get update -y && apt-get install -y git)
command -v openssl >/dev/null 2>&1 || (apt-get update -y && apt-get install -y openssl)

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" checkout "$BRANCH" && git -C "$DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  # The umask stays inside the subshell: left set, it made deploy/pg-certs root-only.
  (umask 077 && cat > .env) <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
HOAX_KEYSTORE_SECRET=$(openssl rand -hex 32)
POSTGRES_PUBLIC_PORT=5432
# Tops up linked Hoax keys with STT for gas. Fund its address (printed below) from the faucet.
GAS_WALLET_PRIVATE_KEY=0x$(openssl rand -hex 32)
HOAX_BUILDER_ADDRESS=
HOAX_BUILDER_FEE_BPS_1K=0
DRY_RUN=false
ENV
  echo "Wrote $DIR/.env with fresh secrets. Back it up: losing HOAX_KEYSTORE_SECRET loses the Hoax keys."
fi

# A self-signed certificate so Netlify reaches Postgres over TLS. The key must
# belong to the container's postgres user (uid 999) and be private.
if [ ! -f deploy/pg-certs/server.key ]; then
  mkdir -p deploy/pg-certs
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=hoax-db" \
    -keyout deploy/pg-certs/server.key -out deploy/pg-certs/server.crt >/dev/null 2>&1
fi
# Repeated on every run, which also repairs installs made with a root-only
# directory: postgres must be able to enter it, and only the key is private.
chown 999:999 deploy/pg-certs/server.key deploy/pg-certs/server.crt
chmod 755 deploy/pg-certs
chmod 644 deploy/pg-certs/server.crt
chmod 600 deploy/pg-certs/server.key

# Ports another program already holds (a Postgres of its own, another app on
# 8080) are swapped for the next free one, and .env remembers the choice.
port_taken() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
pick_port() { # name default
  local key=$1 port
  # `|| true`: under pipefail a missing key makes grep fail and set -e would end the script.
  port=$(grep "^$key=" .env | cut -d= -f2 || true)
  [ -z "$port" ] && port=$2 && echo "$key=$port" >> .env
  # Ours if our own containers are what is listening.
  if docker compose ps --status running -q 2>/dev/null | grep -q .; then return; fi
  while port_taken "$port"; do port=$((port + 1)); done
  sed -i "s/^$key=.*/$key=$port/" .env
}
pick_port POSTGRES_PUBLIC_PORT 5432
pick_port HEALTH_PORT 8080
pick_port HEALTH_PORT_SHANNON 8081
val() { grep "^$1=" .env | cut -d= -f2 || true; }

docker compose up -d --build --remove-orphans

# Nightly database dump at 03:17 UTC, 14 kept (deploy/backup.sh). Replaces any earlier Hoax entry.
chmod 755 deploy/backup.sh
( crontab -l 2>/dev/null | grep -v 'hoax-backup' || true
  echo "17 3 * * * $DIR/deploy/backup.sh >> /var/log/hoax-backup.log 2>&1 # hoax-backup" ) | crontab -

# Open the ports if ufw is active: the engines' health endpoints, Postgres for Netlify.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  for k in HEALTH_PORT HEALTH_PORT_SHANNON POSTGRES_PUBLIC_PORT; do ufw allow "$(val $k)"/tcp; done
fi

echo "Waiting for both engines (Hideki and Shannon)..."
for port in "$(val HEALTH_PORT)" "$(val HEALTH_PORT_SHANNON)"; do
  for i in $(seq 1 60); do
    if curl -fsS "http://localhost:$port/healthz" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  curl -fsS "http://localhost:$port/healthz" && echo
done

IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
GAS=$(curl -fsS "http://localhost:$(val HEALTH_PORT)/healthz" | sed -n 's/.*"gasWallet":"\(0x[0-9a-fA-F]*\)".*/\1/p' || true)
echo
echo "Hideki engine:   http://$IP:$(val HEALTH_PORT)/healthz"
echo "Shannon engine:  http://$IP:$(val HEALTH_PORT_SHANNON)/healthz"
if [ -n "$GAS" ]; then
  echo "Gas wallet:      $GAS"
  echo "                 Send it STT on both Somnia Hideki and Somnia Shannon: it tops up"
  echo "                 every linked Hoax key on that network so the key can pay for its orders."
fi
echo
echo "On Netlify (Project configuration > Environment variables), add:"
echo
echo "  DATABASE_URL = postgres://hoax:$(val POSTGRES_PASSWORD)@$IP:$(val POSTGRES_PUBLIC_PORT)/hoax?sslmode=no-verify"
echo "  DATABASE_CA_CERT = $(base64 -w0 deploy/pg-certs/server.crt)"
echo
echo "DATABASE_CA_CERT is the database's public certificate, not a secret. With it the"
echo "web app trusts that one certificate and nothing else (the sslmode in the URL is"
echo "then ignored); without it the connection is encrypted but unverified."
echo
echo "Mark DATABASE_URL secret (plans that refuse scoped variables need all scopes). Then turn off demo mode (delete HOAX_DEMO)"
echo "and redeploy. The site's engine badge turns green within seconds."
echo "Back up $DIR/.env somewhere safe: it holds the key that decrypts every Hoax key."
