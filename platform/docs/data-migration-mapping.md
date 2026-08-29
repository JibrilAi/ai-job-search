# Local data -> platform data mapping

Documentation only -- no import tool exists yet (a good Phase 6+ candidate:
`POST /api/admin/import-legacy-data` accepting an uploaded bundle of a
user's local repo data files). This table is the reference for building it.

| Local file/format | New location | Notes |
|---|---|---|
| `CLAUDE.md` candidate profile section | `profiles` table (per user) | One-time import would parse the Markdown template's known headings into the JSON columns |
| `job_scraper/seen_jobs.json` (scraper fields: title, company, url, first_seen, deadline, location, portal, source, status) | `jobs` table | Shared pool; `key` -> `dedupe_key` |
| `job_scraper/seen_jobs.json` (rank fields: rank_score, rank_verdict, rank_date, location_verdict, language_gate, language_note, strengths, gaps, deadline) | `user_job_rankings` table | Becomes per-user rows against the importing user's `user_id` |
| `job_search_tracker.csv` (14 columns) | `applications` table (Phase 6) | 1:1 column mapping |
| `company_research/<company>.json` | `company_research_cache` table (Phase 6) | Shared, same 30-day TTL semantics |
| `salary_data.json` | `salary_data` table (Phase 6) | Shared reference data |
| `documents/applications/<company>_<role>/job_posting.md` | `jobs.description` (if matched) or `applications.notes` | Best-effort match by company+role |
| `documents/applications/<company>_<role>/outcome.md` | `applications.notes` (MVP) | Could become a dedicated `application_events` table later for a full timeline |
| `documents/diplomas/`, `documents/references/`, `documents/cv/` | R2 `users/<user_id>/uploads/...` | Direct file copy |
| `cv/main_<company>_<role>.tex` (compiled PDF) | `generated_documents` + R2 (Phase 5) | LaTeX source isn't portable to the HTML/Browser-Rendering pipeline -- historical PDFs are archival only; the platform generates fresh documents from its own templates going forward |
| `cover_letters/cover_<company>_<role>.tex` | Same as above | Same caveat |
| `gmail_sync/state.json` | N/A | Gmail sync is out of scope until a later phase (needs Worker-side OAuth) |
