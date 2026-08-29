-- Phase 2: shared job pool + scrape configuration

CREATE TABLE jobs (
  id          TEXT PRIMARY KEY,
  dedupe_key  TEXT NOT NULL UNIQUE,
  portal      TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  title       TEXT NOT NULL,
  company     TEXT NOT NULL,
  location    TEXT,
  description TEXT,
  deadline    TEXT,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active', -- active | expired
  raw_json    TEXT
);
CREATE INDEX idx_jobs_portal ON jobs(portal);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_last_seen ON jobs(last_seen);

CREATE TABLE scrape_queries (
  id          TEXT PRIMARY KEY,
  portal      TEXT NOT NULL,
  query_json  TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT
);
CREATE INDEX idx_scrape_queries_enabled ON scrape_queries(enabled);

-- Seed: freehire.me broad search, the lowest-risk portal (public JSON API).
INSERT INTO scrape_queries (id, portal, query_json, enabled)
VALUES ('seed-freehire-default', 'freehire', '{"query":"","jobage":7,"limit":50}', 1);
