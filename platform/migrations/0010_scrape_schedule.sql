-- Cloudflare Cron Triggers are static config (wrangler.toml, redeploy-only)
-- -- there is no API to change a live trigger's schedule from application
-- code. So the schedule an admin actually controls lives here instead: the
-- Cron Trigger itself now fires on a short fixed heartbeat, and
-- scheduled.ts's handleScheduled() only does real work once interval_minutes
-- has elapsed since last_run_at. Single-row table (id is always 1) since
-- there is exactly one global scrape cadence.
CREATE TABLE scrape_schedule (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  interval_minutes INTEGER NOT NULL DEFAULT 360,
  last_run_at      TEXT
);

INSERT INTO scrape_schedule (id, interval_minutes, last_run_at) VALUES (1, 360, NULL);
