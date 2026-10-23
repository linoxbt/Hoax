-- The watcher writes one row per process every few seconds, so the web app can
-- say truthfully whether protection is running.
CREATE TABLE IF NOT EXISTS heartbeats (
  service     TEXT PRIMARY KEY,           -- e.g. watcher
  info        JSONB NOT NULL DEFAULT '{}',
  beat_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
