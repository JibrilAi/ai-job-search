-- Phase 3: per-user AI ranking of shared jobs (mirrors seen_jobs.json's rank_* fields,
-- fanned out one row per user x job instead of one prompt run for a single local user)

CREATE TABLE user_job_rankings (
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id               TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'new', -- new | ranked | expired | excluded
  rank_score           REAL,
  rank_verdict         TEXT, -- Strong Fit | Good Fit | Moderate Fit | Weak Fit | Poor Fit
  rank_date            TEXT,
  technical_score      REAL,
  experience_score     REAL,
  behavioral_score     REAL,
  career_score         REAL,
  location_verdict     TEXT, -- PASS | FAIL | FLAG
  language_gate        TEXT, -- PASS | FAIL | FLAG
  language_note        TEXT,
  eligibility_verdict  TEXT, -- PASS | FAIL | unverified
  strengths_json        TEXT,
  gaps_json              TEXT,
  ranked_at_profile_version INTEGER,
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX idx_ujr_user_status ON user_job_rankings(user_id, status);
CREATE INDEX idx_ujr_job ON user_job_rankings(job_id);
