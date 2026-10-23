# Running the Hoax engine

The web app runs on Netlify. The engine (the watcher) has to stay on: it holds
each account's encrypted Hoax key and reads health every second. It runs with
its Postgres on one machine you control, and the web app reaches that Postgres
over TLS.

## A Linux server (Ubuntu or Debian)

Any small VPS works (1 vCPU, 1 GB RAM). As root:

```sh
curl -fsSL https://raw.githubusercontent.com/linoxbt/Hoax/ccr-401058ee-123g91/deploy/vps-setup.sh -o vps-setup.sh
bash vps-setup.sh
```

The script installs Docker if needed, clones the repo to `/opt/hoax`, writes
`.env` with fresh secrets, makes a TLS certificate for Postgres, starts both
containers and prints:

- the gas wallet address: send it some Hideki STT from the faucet; it tops up
  every linked Hoax key so the key can pay for its own orders;
- the `DATABASE_URL` to add on Netlify.

Run it again any time to update: it keeps `.env` and rebuilds. Back up
`/opt/hoax/.env`: losing `HOAX_KEYSTORE_SECRET` loses every Hoax key.

Open ports 5432 (Postgres, for Netlify) and 8080 (the health endpoint) in your
provider's firewall if it has one; the script opens them in `ufw` itself.

## An always-on Mac or Windows PC

Install Docker Desktop, clone the repo, then from its root:

```sh
mkdir -p deploy/pg-certs
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=hoax-db" \
  -keyout deploy/pg-certs/server.key -out deploy/pg-certs/server.crt
cp .env.example .env   # set POSTGRES_PASSWORD, HOAX_KEYSTORE_SECRET (32+ chars), GAS_WALLET_PRIVATE_KEY
docker compose up -d --build
```

Netlify has to reach port 5432 on that machine, so forward it on your router
(or use a tunnel) and use your public address in `DATABASE_URL`.

## Netlify

In Project configuration > Environment variables:

1. Add `DATABASE_URL = postgres://hoax:<password>@<server>:5432/hoax?sslmode=no-verify`,
   marked secret.
2. Delete `HOAX_DEMO`.
3. Redeploy.

The engine badge on the site turns green within a few seconds, and
`/start/link` issues keys. `https://<server>:8080/healthz` shows the watcher's
own view.
