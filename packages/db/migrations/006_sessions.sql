-- "Sign out everywhere": sessions a wallet was issued before this moment are refused.
CREATE TABLE IF NOT EXISTS session_revocations (
  wallet          TEXT PRIMARY KEY,          -- lowercase
  revoked_before  TIMESTAMPTZ NOT NULL
);
