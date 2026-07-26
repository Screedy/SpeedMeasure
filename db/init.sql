CREATE TABLE IF NOT EXISTS measurement (
  time          timestamptz NOT NULL,
  provider      text        NOT NULL,
  server        text,
  download_mbps real CHECK (download_mbps >= 0),
  upload_mbps   real CHECK (upload_mbps >= 0),
  ping_ms       real CHECK (ping_ms >= 0),
  jitter_ms     real CHECK (jitter_ms >= 0),
  loss_pct      real CHECK (loss_pct BETWEEN 0 AND 100),
  invalid       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (time, provider)
);

-- Single-row-per-key config blob.
CREATE TABLE IF NOT EXISTS settings (
  k text PRIMARY KEY,
  v jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS app_user (
  id      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email   text NOT NULL,
  pw_hash text NOT NULL
);

-- Alerts are derived from measurement on read (see shared/alerts.mjs).
CREATE TABLE IF NOT EXISTS alert_ack (
  id       text PRIMARY KEY,
  acked_at timestamptz NOT NULL DEFAULT now()
);

-- Remembers which alert ids have already been emailed, so the runner does not
-- re-send on every cycle.
CREATE TABLE IF NOT EXISTS alert_sent (
  id      text PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);
