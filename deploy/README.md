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

The script installs Docker from the distribution's packages if needed, clones
the repo to `/opt/hoax`, writes `.env` with fresh secrets, makes a TLS
certificate for Postgres, picks free ports if 5432 or 8080 are taken by
something else, starts Postgres and the two engines, and:

- prints the gas wallet address: send it STT on both Hideki and Shannon; it
  tops up every linked Hoax key on that network so the key can pay for its own
  orders;
- writes the web app's settings (`DATABASE_URL`, `DATABASE_CA_CERT`,
  `HOAX_SESSION_SECRET`, ...) to `/opt/hoax/netlify.env`, readable by root only,
  so the database password never lands in the terminal's scrollback.

Run it again any time to update: it keeps `.env` and rebuilds. Local edits in
`/opt/hoax` are replaced by the branch, and saved first as a
`local-changes-*.patch`. Back up `/opt/hoax/.env`: losing
`HOAX_KEYSTORE_SECRET` loses every Hoax key.

Open the Postgres port (5432 unless the script moved it) for Netlify in your
provider's firewall if it has one; the script opens it in `ufw` itself. `.env`
records the ports it chose.

**The database port is public.** Netlify functions have no fixed addresses to
allow, so Postgres listens on every interface. It accepts only TLS, only the
`hoax` user on the `hoax` database, only with the password (SCRAM, a random
48-hex-character one), and logs every connection. To keep it off the internet,
run the web app where it has fixed egress or a private network to the server,
and set `POSTGRES_BIND` in `.env` to that interface; or use a managed Postgres
and point `DATABASE_URL` (engines and web) at it.

The engines' health endpoints (8080 Hideki, 8081 Shannon) listen on
`127.0.0.1` only. From your own machine:
`ssh -L 8080:127.0.0.1:8080 root@<server>`, then open
`http://localhost:8080/healthz`. Each answers 503 when its engine is not doing
its job, and an engine that stays unhealthy for two minutes exits so Docker
restarts it. Only one engine per network can run: a second one exits at start.

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

Add each line of `/opt/hoax/netlify.env` (`sudo cat /opt/hoax/netlify.env`),
scoped to Functions:

1. `DATABASE_URL` (secret) and `DATABASE_CA_CERT`. The second is the
   database's public certificate: with it the web app trusts that certificate
   and no other, so nobody can sit between Netlify and the database. A
   production web app refuses a remote Postgres without it (or
   `sslmode=verify-full`).
2. `HOAX_SESSION_SECRET` (secret, 32+ characters). Required: without it every
   serverless instance would sign its own sessions and sign-in would fail.
3. On a custom domain, `HOAX_SITE_HOSTS = your.domain`. Sign-in messages are
   only issued for the site's own addresses; Netlify's own URLs are added at
   build time. A production deployment with no address list refuses sign-in.
4. If Hoax charges a builder fee, `HOAX_BUILDER_ADDRESS` and
   `HOAX_BUILDER_FEE_BPS_1K` (the same values as the engines').
5. Delete `HOAX_DEMO`, then redeploy.

The engine badge on the site turns green within a few seconds, and
`/start/link` issues keys on either network.

## Elsewhere

`railway.toml` builds the same engine image: one Railway service per network,
each with `NETWORK` set (`hideki` or `shannon`), the same `DATABASE_URL` and
`HOAX_KEYSTORE_SECRET`, and a volume mounted at `/data`. The lease makes a
second service on the same network exit rather than trade.
`apps/web/vercel.json` deploys the web app to Vercel with the same variables;
its own URLs join the sign-in address list automatically.
