-- Pins the exact CV/cover-letter documents a user reviewed at the moment
-- an application reaches "ready_to_submit" (see lib/documents/autoSubmit.ts
-- and routes/applications.ts's POST /:id/submit), separate from
-- cv_document_id/cover_letter_document_id, which just point at "whatever
-- is currently attached." The actual submit pass reads the approved_*
-- columns, not the current ones -- so if a document generation flow is
-- ever added that mutates cv_document_id/cover_letter_document_id after
-- review (none does today), the send step still submits exactly what the
-- user approved rather than silently picking up a swapped document.
ALTER TABLE applications ADD COLUMN approved_cv_document_id TEXT;
ALTER TABLE applications ADD COLUMN approved_cover_letter_document_id TEXT;
