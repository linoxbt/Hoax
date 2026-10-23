-- Accounts live on a network: Hideki (50383) or Shannon (50312). The same Safe
-- address can exist on both, so "one protected account per owner" becomes one
-- per owner per network. Existing rows are Hideki accounts.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 50383;
DROP INDEX IF EXISTS accounts_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_active_per_chain ON accounts (owner, chain_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS accounts_owner_chain ON accounts (owner, chain_id);
