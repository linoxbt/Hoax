-- Every liquidation event the engine scans, with its block: whether a close was
-- followed by a liquidation is decided by block numbers, not by when a scan ran,
-- and no step inside an earlier miss's episode goes unrecorded.
CREATE TABLE IF NOT EXISTS liquidations (
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pool        TEXT NOT NULL,
  block       NUMERIC NOT NULL,
  tx_hash     TEXT NOT NULL,
  size_delta  NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, pool, tx_hash, size_delta)
);
CREATE INDEX IF NOT EXISTS liquidations_after ON liquidations (account_id, pool, block);

-- The nonce an order was sent with, so a stuck one can be told from a dropped one and cancelled.
ALTER TABLE actions ADD COLUMN IF NOT EXISTS tx_nonce INTEGER;
CREATE INDEX IF NOT EXISTS actions_owner_market ON actions (owner, market, created_at DESC);

-- Sign-in nonces, each good once: the primary key makes a parallel replay lose.
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce       TEXT PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS used_nonces_expiry ON used_nonces (expires_at);
