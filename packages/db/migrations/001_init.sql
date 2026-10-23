-- Hoax schema. Amounts are stored as decimal strings of raw on-chain units
-- (NUMERIC) so nothing is rounded; health ratios are plain doubles.

CREATE TABLE IF NOT EXISTS accounts (
  id                    UUID PRIMARY KEY,
  owner                 TEXT NOT NULL,             -- the dreamDEX wallet Hoax protects (lowercase)
  hoax_key              TEXT UNIQUE,               -- the linked bot key's address; NULL until the watcher makes it
  status                TEXT NOT NULL,             -- pending_key | pending_link | active | unlinked
  manage_token_hash     TEXT NOT NULL,             -- sha256 of the token the trader manages Hoax with
  builder_approval_1k   NUMERIC NOT NULL DEFAULT 0,-- effective builder approval, bps x 1000
  paused                BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_owner ON accounts (owner);
CREATE INDEX IF NOT EXISTS accounts_status ON accounts (status);
-- One protected account per owner at a time.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_active ON accounts (owner) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS policies (
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  market            TEXT NOT NULL,                 -- e.g. ETH-PERP
  trigger_health    DOUBLE PRECISION NOT NULL,
  target_health     DOUBLE PRECISION NOT NULL,
  max_close_pct     DOUBLE PRECISION NOT NULL,
  max_slippage_bps  DOUBLE PRECISION NOT NULL,
  cooldown_s        INTEGER NOT NULL,
  floor_size        NUMERIC,                       -- raw base units; NULL = market minimum
  lambda            DOUBLE PRECISION NOT NULL,
  trigger_margin    DOUBLE PRECISION NOT NULL,
  allow_full_close  BOOLEAN NOT NULL,
  enabled           BOOLEAN NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, market)
);

CREATE TABLE IF NOT EXISTS health_ticks (
  id           BIGSERIAL PRIMARY KEY,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  market       TEXT NOT NULL,
  block        NUMERIC NOT NULL,
  health       DOUBLE PRECISION,                   -- NULL when there is no requirement (flat)
  equity       NUMERIC NOT NULL,
  mm_req       NUMERIC NOT NULL,
  mark         NUMERIC NOT NULL,
  mark_ok      BOOLEAN NOT NULL,
  size         NUMERIC NOT NULL,
  liq_price    NUMERIC,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_ticks_latest ON health_ticks (account_id, market, created_at DESC);
CREATE INDEX IF NOT EXISTS health_ticks_age ON health_ticks (created_at);

CREATE TABLE IF NOT EXISTS actions (
  id                   UUID PRIMARY KEY,
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  owner                TEXT NOT NULL,
  market               TEXT NOT NULL,
  pool                 TEXT NOT NULL,
  side                 TEXT NOT NULL,
  block                NUMERIC,
  tx_hash              TEXT,
  size_before          NUMERIC NOT NULL,
  size_requested       NUMERIC NOT NULL,
  size_filled          NUMERIC NOT NULL,
  size_after           NUMERIC,
  avg_price            NUMERIC,
  mark                 NUMERIC NOT NULL,
  cost                 NUMERIC,
  est_close_cost       NUMERIC,
  est_liq_cost         NUMERIC,
  forced_slippage      NUMERIC,
  equity_before        NUMERIC NOT NULL,
  mm_req_before        NUMERIC NOT NULL,
  health_before        DOUBLE PRECISION NOT NULL,
  health_after         DOUBLE PRECISION,
  liq_price_before     NUMERIC,
  liq_price_after      NUMERIC,
  builder_fee_1k       NUMERIC NOT NULL DEFAULT 0,
  outcome              TEXT NOT NULL,              -- pending | saved | not-needed | missed | conflict | skipped
  reason               TEXT,
  receipt              JSONB NOT NULL,
  receipt_hash         TEXT NOT NULL,
  signature            TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS actions_owner ON actions (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS actions_pending ON actions (outcome) WHERE outcome = 'pending';

CREATE TABLE IF NOT EXISTS counterfactuals (
  action_id             UUID PRIMARY KEY REFERENCES actions(id) ON DELETE CASCADE,
  original_liq_price    NUMERIC,
  reached_at_block      NUMERIC,
  equity_at_reach       NUMERIC,
  equity_if_liquidated  NUMERIC,
  preserved             NUMERIC,
  final_outcome         TEXT NOT NULL,
  resolved_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alerts (
  id          BIGSERIAL PRIMARY KEY,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS alerts_account ON alerts (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gas_drips (
  id          BIGSERIAL PRIMARY KEY,
  hoax_key    TEXT NOT NULL,
  amount      NUMERIC NOT NULL,
  tx_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gas_drips_key ON gas_drips (hoax_key, created_at DESC);
