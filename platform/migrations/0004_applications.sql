-- Phase 6: application tracker (mirrors job_search_tracker.csv's 14 columns) + shared
-- reference caches (company research, salary benchmarks)

CREATE TABLE applications (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id                    TEXT REFERENCES jobs(id),
  date                      TEXT,
  company                   TEXT NOT NULL,
  sector                    TEXT,
  role                      TEXT NOT NULL,
  role_type                 TEXT,
  channel                   TEXT,
  status                    TEXT NOT NULL DEFAULT 'drafted',
  -- drafted | applied | interview | offer | hired | rejected | no_response | offer_declined | withdrawn
  contact_person            TEXT,
  fit_rating                TEXT,
  notes                     TEXT,
  cv_document_id            TEXT,
  cover_letter_document_id  TEXT,
  source                    TEXT,
  deadline                  TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);
CREATE INDEX idx_applications_user ON applications(user_id);
CREATE INDEX idx_applications_status ON applications(user_id, status);

CREATE TABLE company_research_cache (
  company_normalized     TEXT PRIMARY KEY,
  company_display        TEXT,
  fetched_date            TEXT NOT NULL,
  sources_json             TEXT NOT NULL DEFAULT '{}',
  network_contacts_note     TEXT
);

CREATE TABLE salary_data (
  id           TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  city         TEXT,
  category     TEXT,
  index_value  REAL,
  metadata_json TEXT
);
CREATE INDEX idx_salary_company ON salary_data(company);
