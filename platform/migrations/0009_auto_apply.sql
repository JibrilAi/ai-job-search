-- Per-user opt-in: when a job ranks Strong/Good Fit for a user, automatically
-- draft a tailored CV, cover letter, and a "drafted" application entry so
-- it's ready for one-click review. Actual submission to the job board stays
-- manual -- see queue-consumers/rankConsumer.ts and lib/documents/autoDraft.ts.
ALTER TABLE profiles ADD COLUMN auto_apply_enabled INTEGER NOT NULL DEFAULT 0;
