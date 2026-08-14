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

-- Saved iperf3 nodes for on-demand ad-hoc testing (see runner/iperf.mjs)
CREATE TABLE IF NOT EXISTS iperf_target (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  host       text NOT NULL,
  port       int  NOT NULL DEFAULT 5201,
  link_mbps  int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per manual test run. `target_*` is a snapshot, not a foreign key.
-- Run stays readable after its target is deleted. `term`/`samples` fill in
-- live while status is 'running'; the browser polls until it isn't.
CREATE TABLE IF NOT EXISTS iperf_run (
  id          text PRIMARY KEY,
  target_name text NOT NULL,
  target_host text NOT NULL,
  target_port int  NOT NULL,
  direction   text NOT NULL,
  protocol    text NOT NULL,
  duration    int  NOT NULL,
  streams     int  NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  term        text NOT NULL DEFAULT '',
  samples     jsonb NOT NULL DEFAULT '[]',
  result      jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Columns added after a release. They appear in the CREATE TABLE above as well,
-- so these are no-ops on a fresh database and are the only thing that does any
-- work on an existing one. Append when you add a column; never remove a line.
-- ---------------------------------------------------------------------------

-- 0.1: excludes a bad reading from the chart, averages and alerts.
ALTER TABLE measurement ADD COLUMN IF NOT EXISTS invalid boolean NOT NULL DEFAULT false;
