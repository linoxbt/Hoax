-- Hits counted by the web app's rate limits. Its serverless instances share no
-- memory, so the counts live here. The watcher prunes rows older than a day.
CREATE TABLE IF NOT EXISTS rate_hits (
  bucket  TEXT NOT NULL,                 -- e.g. register-ip:1.2.3.4
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_hits_bucket ON rate_hits (bucket, at);
CREATE INDEX IF NOT EXISTS rate_hits_age ON rate_hits (at);
