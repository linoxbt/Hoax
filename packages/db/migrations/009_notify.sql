-- Where an owner's alerts go besides the dashboard: one Telegram chat and one email
-- address at most. A target is used only once verified: the Telegram chat that
-- answered the link code, or the address that opened the confirmation link. Codes
-- are stored hashed and expire.
CREATE TABLE IF NOT EXISTS notify_targets (
  owner            TEXT NOT NULL,              -- lowercase account owner
  kind             TEXT NOT NULL CHECK (kind IN ('telegram', 'email')),
  target           TEXT,                       -- chat id, or email address
  verified         BOOLEAN NOT NULL DEFAULT false,
  code_hash        TEXT,
  code_expires_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner, kind)
);
CREATE UNIQUE INDEX IF NOT EXISTS notify_targets_code ON notify_targets (code_hash) WHERE code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS notify_targets_target ON notify_targets (kind, target);
