-- Phase 5: CV / cover-letter templates + generated documents (R2 pointers)

CREATE TABLE cv_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id), -- NULL = system/global template
  html_source   TEXT NOT NULL,
  css_source    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE cover_letter_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  html_source   TEXT NOT NULL,
  css_source    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE generated_documents (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  TEXT REFERENCES applications(id),
  type            TEXT NOT NULL, -- cv | cover_letter
  template_id     TEXT NOT NULL,
  r2_key          TEXT NOT NULL,
  ats_verified    INTEGER NOT NULL DEFAULT 0,
  ats_report_json TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_generated_documents_user ON generated_documents(user_id);

-- Foreign keys from applications -> generated_documents are enforced at the
-- application layer (D1/SQLite doesn't support adding FKs via ALTER TABLE).
