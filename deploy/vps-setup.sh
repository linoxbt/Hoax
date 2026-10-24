#!/usr/bin/env bash
# Set up the Hoax watcher and its Postgres on a fresh Ubuntu/Debian VPS.
# Run as root (or with sudo):  bash vps-setup.sh
# Safe to run again: it keeps an existing .env and only rebuilds.
set -euo pipefail

REPO=https://github.com/linoxbt/Hoax.git
BRANCH=${BRANCH:-main}
DIR=${DIR:-/opt/hoax}

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker from the distribution's packages..."
  apt-get update -y
  # Ubuntu calls the Compose plugin docker-compose-v2, Docker's own repository docker-compose-plugin.
  if ! apt-get install -y docker.io docker-compose-v2 && ! apt-get install -y docker.io docker-compose-plugin; then
    # Not packaged here: Docker's convenience script, downloaded first so it can be read before it runs.
    echo "Docker is not packaged for this system. Fetching Docker's install script to /tmp/get-docker.sh;"
    echo "read it, then run: sh /tmp/get-docker.sh && bash $0"
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    exit 1
  fi
fi
command -v git >/dev/null 2>&1 || (apt-get update -y && apt-get install -y git)
command -v openssl >/dev/null 2>&1 || (apt-get update -y && apt-get install -y openssl)

if [ -d "$DIR/.git" ]; then
  # Local edits (to compose or pg_hba.conf, say) are saved as a patch, not silently lost.
  if ! git -C "$DIR" diff --quiet; then
    patch="$DIR/local-changes-$(date +%Y%m%d-%H%M%S).patch"
    git -C "$DIR" diff > "$patch"
    echo "Local changes in $DIR are replaced by $BRANCH; they are saved in $patch"
  fi
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
# Not used here: the web app's session secret, kept so every run prints the same one.
HOAX_SESSION_SECRET=$(openssl rand -hex 32)
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
# Installs from before the web app needed one: add it once.
if [ -z "$(val HOAX_SESSION_SECRET)" ]; then
  (umask 077 && echo "HOAX_SESSION_SECRET=$(openssl rand -hex 32)" >> .env)
fi

docker compose up -d --build --remove-orphans

# Open Postgres if ufw is active: Netlify reaches it over TLS. The engines'
# health endpoints listen on 127.0.0.1 only and stay closed.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "$(val POSTGRES_PUBLIC_PORT)"/tcp
fi

echo "Waiting for both engines (Hideki and Shannon)..."
for port in "$(val HEALTH_PORT)" "$(val HEALTH_PORT_SHANNON)"; do
  for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  curl -sS "http://127.0.0.1:$port/healthz" && echo
done

IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
GAS=$(curl -fsS "http://127.0.0.1:$(val HEALTH_PORT)/healthz" | sed -n 's/.*"gasWallet":"\(0x[0-9a-fA-F]*\)".*/\1/p' || true)
echo
echo "Hideki engine:   http://127.0.0.1:$(val HEALTH_PORT)/healthz   (on this machine; ssh -L $(val HEALTH_PORT):127.0.0.1:$(val HEALTH_PORT) to look from yours)"
echo "Shannon engine:  http://127.0.0.1:$(val HEALTH_PORT_SHANNON)/healthz"
if [ -n "$GAS" ]; then
  echo "Gas wallet:      $GAS"
  echo "                 Send it STT on both Somnia Hideki and Somnia Shannon: it tops up"
  echo "                 every linked Hoax key on that network so the key can pay for its orders."
fi
# The web app's settings go to a root-only file, not the terminal: the database
# password would otherwise sit in scrollback and shell logs.
NETLIFY_ENV="$DIR/netlify.env"
(umask 077 && cat > "$NETLIFY_ENV") <<NETLIFY
# Paste these into Netlify (Project configuration > Environment variables), scoped to Functions.
# DATABASE_URL and HOAX_SESSION_SECRET are secrets: mark them so.
DATABASE_URL=postgres://hoax:$(val POSTGRES_PASSWORD)@$IP:$(val POSTGRES_PUBLIC_PORT)/hoax?sslmode=no-verify
DATABASE_CA_CERT=$(base64 -w0 deploy/pg-certs/server.crt)
HOAX_SESSION_SECRET=$(val HOAX_SESSION_SECRET)
# Your site's own hosts, comma-separated, if it has a custom domain (Netlify's own URLs are added automatically).
HOAX_SITE_HOSTS=
HOAX_BUILDER_ADDRESS=$(val HOAX_BUILDER_ADDRESS)
HOAX_BUILDER_FEE_BPS_1K=$(val HOAX_BUILDER_FEE_BPS_1K)
NETLIFY
echo
echo "The web app's settings are in $NETLIFY_ENV (readable by root only):"
echo "  sudo cat $NETLIFY_ENV"
echo "Add each to Netlify, scoped to Functions; mark DATABASE_URL and HOAX_SESSION_SECRET secret."
echo "DATABASE_CA_CERT pins the database's own certificate: the web app trusts it and nothing else."
echo "Then turn off demo mode (delete HOAX_DEMO) and redeploy. The engine badge turns green within seconds."
echo "Back up $DIR/.env somewhere safe: it holds the key that decrypts every Hoax key."
