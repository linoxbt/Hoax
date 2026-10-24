-- Safety and accounting fixes.

-- Which migrations have run (migrate.ts records each file here and skips it next time).
CREATE TABLE IF NOT EXISTS schema_migrations (
  name        TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Where each account's liquidation scan has got to, so a restart or an outage
-- pages forward from there instead of skipping what happened meanwhile.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS liq_scan_from NUMERIC;

-- The legacy manage token is gone: management is by wallet sign-in only.
ALTER TABLE accounts ALTER COLUMN manage_token_hash DROP NOT NULL;
UPDATE accounts SET manage_token_hash = NULL WHERE manage_token_hash IS NOT NULL;

-- At most one registration waiting for its key or link per owner per network,
-- so two parallel sign-ups cannot make two keys. Older duplicates retire first.
UPDATE accounts a SET status = 'retired'
 WHERE a.status IN ('pending_key', 'pending_link')
   AND EXISTS (
     SELECT 1 FROM accounts b
      WHERE b.owner = a.owner AND b.chain_id = a.chain_id AND b.id <> a.id
        AND b.status IN ('pending_key', 'pending_link')
        AND (b.created_at, b.id) > (a.created_at, a.id));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_pending_per_chain
  ON accounts (owner, chain_id) WHERE status IN ('pending_key', 'pending_link');
-- accounts_owner_chain covers every lookup the old single-column index did.
DROP INDEX IF EXISTS accounts_owner;

-- A flat account's health is not a number; store NULL rather than a fake 0.
ALTER TABLE actions ALTER COLUMN health_before DROP NOT NULL;

-- The engine's cooldown and miss lookups and the tracker's liquidation check.
CREATE INDEX IF NOT EXISTS actions_account_market ON actions (account_id, market, created_at DESC);
CREATE INDEX IF NOT EXISTS actions_account_pool_outcome ON actions (account_id, pool, outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS actions_unconfirmed ON actions (account_id) WHERE outcome = 'unconfirmed';

-- The signed record of how a pending receipt resolved.
ALTER TABLE counterfactuals ADD COLUMN IF NOT EXISTS resolution JSONB;
ALTER TABLE counterfactuals ADD COLUMN IF NOT EXISTS resolution_hash TEXT;
ALTER TABLE counterfactuals ADD COLUMN IF NOT EXISTS resolution_signature TEXT;

-- Gas drips are reserved before they are sent, so the caps hold across
-- processes and a drip whose receipt was lost still counts.
ALTER TABLE gas_drips ADD COLUMN IF NOT EXISTS chain_id INTEGER;
ALTER TABLE gas_drips ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE gas_drips ALTER COLUMN tx_hash DROP NOT NULL;
CREATE INDEX IF NOT EXISTS gas_drips_chain ON gas_drips (chain_id, created_at DESC);
