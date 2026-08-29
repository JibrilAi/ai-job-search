-- Phase 1: users, sessions, profiles

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT,
  password_salt  TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Shape mirrors CLAUDE.md's Candidate Profile section, one row per user.
CREATE TABLE profiles (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT,
  city                 TEXT,
  country              TEXT,
  commute_constraints  TEXT,
  cv_language          TEXT,
  employment_status    TEXT,
  linkedin_headline    TEXT,
  languages_json       TEXT NOT NULL DEFAULT '[]',
  education_json       TEXT NOT NULL DEFAULT '[]',
  experience_json      TEXT NOT NULL DEFAULT '[]',
  skills_json          TEXT NOT NULL DEFAULT '{}',
  certifications_json  TEXT NOT NULL DEFAULT '[]',
  publications_json    TEXT NOT NULL DEFAULT '[]',
  awards_json          TEXT NOT NULL DEFAULT '[]',
  behavioral_json      TEXT NOT NULL DEFAULT '{}',
  motivation_json      TEXT NOT NULL DEFAULT '{}',
  target_sectors_json  TEXT NOT NULL DEFAULT '[]',
  dealbreakers_json    TEXT NOT NULL DEFAULT '[]',
  eligibility_json     TEXT NOT NULL DEFAULT '{}',
  profile_version      INTEGER NOT NULL DEFAULT 1,
  updated_at           TEXT NOT NULL
);
