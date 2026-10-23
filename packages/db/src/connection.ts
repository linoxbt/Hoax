// How Hoax connects to Postgres. With DATABASE_CA_CERT set (the server's
// certificate, as PEM or as base64 of the PEM), the connection is TLS and only
// that certificate is trusted. The engine's Postgres uses a self-signed
// certificate, so pinning it stands in for both the CA chain and the hostname
// check: nobody without its private key can sit in the middle. Without it the
// connection string decides, as before.
import type { ClientConfig } from "pg";

export function pgConfig(connectionString: string, caCert: string | undefined = process.env.DATABASE_CA_CERT): ClientConfig {
  const raw = caCert?.trim();
  if (!raw) return { connectionString };
  const pem = raw.startsWith("-----BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
  if (!pem.includes("-----BEGIN CERTIFICATE-----")) throw new Error("DATABASE_CA_CERT must be a PEM certificate or the base64 of one");
  // node-postgres lets ssl settings in the URL override the ones given here, so they go.
  const url = new URL(connectionString);
  for (const k of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(k);
  return {
    connectionString: url.toString(),
    ssl: { ca: pem, rejectUnauthorized: true, checkServerIdentity: () => undefined },
  };
}
