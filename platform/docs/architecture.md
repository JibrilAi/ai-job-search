# Architecture

## Why this exists

The rest of this repo is a local, single-user job-search tool driven by
Claude Code slash-commands. This directory is a separate, hosted, multi-user
rebuild of the same core loop (scrape -> rank -> track -> apply) on
Cloudflare, so the workflow can run for many users without anyone's own
machine. See the approved plan this was built from for the full decision
record; this file is the living summary.

## Request flow

```
Browser (React, Cloudflare Pages)
  -> fetch /api/* with credentials: include (httpOnly session cookie)
  -> Worker (Hono router) [worker/src/index.ts]
       /api/auth      -> worker/src/routes/auth.ts
       /api/profile   -> worker/src/routes/profile.ts
       /api/jobs      -> worker/src/routes/jobs.ts
       /api/rankings  -> worker/src/routes/rankings.ts
  -> D1 (ai_job_search_db) for all reads/writes
```

## Background pipelines

```
Cron Trigger (every 6h, no arguments)
  -> scheduled() reads enabled scrape_queries rows
  -> enqueues one message per row onto SCRAPE_QUEUE

SCRAPE_QUEUE consumer (queue-consumers/scrapeConsumer.ts)
  -> runs the named portal's scraper (lib/scrapers/<portal>.ts)
  -> upserts each result into `jobs`, deduped on dedupe_key
  -> for genuinely new jobs, enqueues one message per (active user x new job)
     onto RANK_QUEUE

RANK_QUEUE consumer (queue-consumers/rankConsumer.ts)
  -> loads the job + that user's profile
  -> calls the LLM (lib/ranking/llmClient.ts -> lib/llmClient.ts) with
     forced structured JSON output, reproducing 04-job-evaluation.md's rubric
  -> computes the weighted score server-side (never trusts the model's math)
  -> writes to user_job_rankings
```

**LLM provider**: `lib/llmClient.ts` is the one entry point every LLM call
site uses (ranking, resume extraction, CV tailoring, cover letters, profile
field suggestions). It tries OpenRouter's free-model router
(`lib/openRouterClient.ts`, model `openrouter/free` -- rotates across
OpenRouter's free-model pool rather than pinning one, so we're not tracking
which specific free model is still live) first, and falls back to Gemini
(`lib/geminiClient.ts`, pay-as-you-go tier) automatically on any OpenRouter
failure -- rate limit, a flaky free model, a transient error. Each call site
defines its schema once in Gemini's shape (uppercase OpenAPI-style types,
`nullable: true`); `openRouterClient.ts` converts it to the JSON Schema
OpenRouter expects rather than the schema being duplicated per provider.

Shared scrape, per-user matching (see README/plan): the `jobs` table is one
shared pool scraped once; `user_job_rankings` is the per-user fan-out. This
is why a new job costs one scrape but N ranking calls (one per user with a
profile) -- the plan's cost-mitigation notes (pre-filtering, staying within
free-tier quotas) apply here as usage grows.

## Data model

See `migrations/0001`..`0005` for the authoritative schema. Summary:

| Table | Owner | Purpose |
|---|---|---|
| `users`, `sessions` | auth routes | accounts, session tokens (not JWTs -- revocation is a DELETE) |
| `profiles` | profile routes | one row per user, mirrors CLAUDE.md's Candidate Profile |
| `jobs` | scrape consumer | shared job pool, deduped on `dedupe_key` |
| `scrape_queries` | scheduled handler | what the Cron handler tells the scrape queue to do |
| `user_job_rankings` | rank consumer | per-(user, job) AI score, verdict, gate results |
| `applications`, `company_research_cache`, `salary_data` | applications/companyResearch/salary routes | tracker + shared reference caches |
| `cv_templates`, `cover_letter_templates`, `generated_documents` | documents routes | seeded default templates; MVP rendering is code-driven (`lib/documents/{cvTemplate,coverLetterTemplate}.ts`), not read from these tables' html_source/css_source |

## Frontend

`frontend/src/App.tsx` wires React Router routes behind a session-cookie
`RequireAuth` guard (`frontend/src/components/RequireAuth.tsx`). API calls go
through `frontend/src/api/client.ts`, a thin typed fetch wrapper -- there is
no client-side state library; each route fetches what it needs with
`useEffect`.

## Document generation (Phase 5)

`worker/src/routes/documents.ts`:
- `POST /api/documents/cv` -- renders `lib/documents/cvTemplate.ts` (profile
  data only) to HTML, calls `lib/documents/browserRender.ts` (Browser
  Rendering API via `@cloudflare/puppeteer`) for a PDF, verifies the text
  layer with `lib/documents/verifyPdf.ts` (`unpdf`), uploads to R2, records a
  `generated_documents` row.
- `POST /api/documents/cover-letter` -- additionally calls
  `lib/documents/coverLetterDraft.ts` (a Claude API call, same forced
  tool-use pattern as ranking) to draft the letter's prose before rendering.
- Both routes verify against **a copy** of the PDF buffer
  (`pdf.slice(0)`) before uploading the original to R2 -- `unpdf`/pdf.js
  detaches the buffer it's given, so verifying first and uploading the same
  reference afterward silently produces a 0-byte R2 object. Found by testing
  against a real generated PDF; see platform/README.md.

Fonts (`lib/documents/fonts.ts`) are base64-encoded from the project's actual
`cover_letters/OpenFonts/fonts/{lato,raleway}/` files and embedded as
`@font-face` data URIs, so Browser Rendering never needs an external font
fetch.

## Auto-apply and auto-submit

`lib/documents/autoDraft.ts`'s `autoDraftApplication()` is called from
`rankConsumer.ts` when a user has `profile.autoApplyEnabled` on and a job
just ranked Strong/Good Fit: it drafts a tailored CV, cover letter, and a
`drafted`-status `applications` row -- the same pipeline as the manual
document-studio endpoints above, just triggered automatically instead of
by a user click.

`profile.autoSubmitMode` (`"off"` | `"confirm"` | `"unattended"`) goes one
step further, but **only for jobs from `portal === "freehire"`**:
`lib/documents/autoSubmit.ts`'s `runFreehireApplication()` browser-automates
freehire.me's actual apply form (Puppeteer, same Browser Rendering binding
as PDF generation) -- generic label/name-keyword field matching, PDF resume
upload injected client-side via the DataTransfer API (Browser Rendering has
no writable filesystem for Puppeteer's usual `uploadFile(path)`). `"confirm"`
stops after filling (`applications.status = "ready_to_submit"`, sent later
via `POST /applications/:id/submit`); `"unattended"` clicks the real submit
button immediately, no human step. **LinkedIn is deliberately excluded even
with auto-submit on** -- it aggressively detects and bans automated account
activity and this would likely violate its Terms of Service; LinkedIn jobs
always stop at drafting. This repo's sandbox cannot reach freehire.me to
verify the automation's selectors against the real site -- treat it as a
first attempt pending real-world testing, not a finished integration.

`autoSubmit.ts`'s `FIELD_KEYWORDS` covers common application-screener
questions researched across LinkedIn/Indeed/Greenhouse/Lever/Workday
(notice period, salary expectation, relocation willingness, remote/hybrid/
onsite preference, portfolio/GitHub URL, work authorization, sponsorship
needs) mapped to the matching `profiles` columns added in
`migrations/0013_profile_application_fields.sql`. It deliberately excludes
EEO/voluntary-self-identification questions (race, gender, veteran status,
disability) via `NEVER_FILL_KEYWORDS` -- an active skip, not just an
absent category -- so the automation can never answer on a candidate's
behalf on those, even if a label would otherwise coincidentally match.

`applications.approved_cv_document_id`/`approved_cover_letter_document_id`
(migration `0012`) pin the exact documents reviewed at the moment an
application reaches `ready_to_submit`; `POST /applications/:id/submit`
sends those, not whatever's currently attached to the application, so a
later document regeneration can never silently change what gets sent.

## What's deliberately not built yet

- The four Danish portals' scrapers (jobbank/jobdanmark/jobindex/jobnet) --
  ported the same way as `lib/scrapers/freehire.ts`, registered in
  `lib/scrapers/registry.ts`, but deferred as out-of-market for this
  deployment's default seed (freehire, linkedin, greenhouse, and lever
  *are* wired up).
- LinkedIn auto-submission -- see "Auto-apply and auto-submit" above; this
  is an intentional, permanent boundary, not a TODO.
- Vectorize (semantic job search/dedupe) -- exact-key dedupe covers MVP.
- Gmail sync, Notion sync -- would need Worker-side OAuth, out of scope for
  now.
