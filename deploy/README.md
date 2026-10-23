# Running the Hoax engine

The web app runs on Netlify. The engine (the watcher) has to stay on: it holds
each account's encrypted Hoax key and reads health every second. One engine
runs per network, Somnia Hideki and Somnia Shannon, both with one Postgres on a
machine you control; the web app reaches that Postgres over TLS.

## A Linux server (Ubuntu or Debian)

Any small VPS works (1 vCPU, 1 GB RAM). As root:

```sh
curl -fsSL https://raw.githubusercontent.com/linoxbt/Hoax/main/deploy/vps-setup.sh -o vps-setup.sh
bash vps-setup.sh
```

The script installs Docker if needed, clones the repo to `/opt/hoax`, writes
`.env` with fresh secrets, makes a TLS certificate for Postgres, picks free
ports if 5432 or 8080 are taken by something else, starts Postgres and the two
engines, and prints:

- the gas wallet address: send it STT on both Hideki and Shannon; it tops up
  every linked Hoax key on that network so the key can pay for its own orders;
- the `DATABASE_URL` to add on Netlify.

Run it again any time to update: it keeps `.env` and rebuilds. Back up
`/opt/hoax/.env`: losing `HOAX_KEYSTORE_SECRET` loses every Hoax key.

Open the Postgres port (5432 unless the script moved it) for Netlify, and
optionally the health ports (8080 Hideki, 8081 Shannon), in your provider's
firewall if it has one; the script opens them in `ufw` itself. `.env` records
the ports it chose.

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
   marked secret, and `DATABASE_CA_CERT = <the base64 line the script printed>`.
   The second is the database's public certificate: with it the web app trusts
   that certificate and no other, so nobody can sit between Netlify and the
   database. Postgres refuses connections without TLS either way.
   On a custom domain, also add `HOAX_SITE_HOSTS = your.domain` (sign-in
   messages are only issued for the site's own addresses).
2. Delete `HOAX_DEMO`.
3. Redeploy.

The engine badge on the site turns green within a few seconds, and
`/start/link` issues keys on either network. `http://<server>:8080/healthz`
(Hideki) and `:8081/healthz` (Shannon) show each engine's own view.
