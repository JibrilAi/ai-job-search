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
  -> calls the Claude API (lib/ranking/claudeClient.ts) with a forced
     submit_ranking tool call, reproducing 04-job-evaluation.md's rubric
  -> computes the weighted score server-side (never trusts the model's math)
  -> writes to user_job_rankings
```

Shared scrape, per-user matching (see README/plan): the `jobs` table is one
shared pool scraped once; `user_job_rankings` is the per-user fan-out. This
is why a new job costs one scrape but N ranking calls (one per user with a
profile) -- the plan's cost-mitigation notes (prompt caching, pre-filtering)
apply here as usage grows.

## Data model

See `migrations/0001`..`0005` for the authoritative schema. Summary:

| Table | Owner | Purpose |
|---|---|---|
| `users`, `sessions` | auth routes | accounts, session tokens (not JWTs -- revocation is a DELETE) |
| `profiles` | profile routes | one row per user, mirrors CLAUDE.md's Candidate Profile |
| `jobs` | scrape consumer | shared job pool, deduped on `dedupe_key` |
| `scrape_queries` | scheduled handler | what the Cron handler tells the scrape queue to do |
| `user_job_rankings` | rank consumer | per-(user, job) AI score, verdict, gate results |
| `applications`, `company_research_cache`, `salary_data` | not yet built (Phase 6) | tracker + shared reference caches |
| `cv_templates`, `cover_letter_templates`, `generated_documents` | not yet built (Phase 5) | HTML/CSS templates + R2 pointers to rendered PDFs |

## Frontend

`frontend/src/App.tsx` wires React Router routes behind a session-cookie
`RequireAuth` guard (`frontend/src/components/RequireAuth.tsx`). API calls go
through `frontend/src/api/client.ts`, a thin typed fetch wrapper -- there is
no client-side state library; each route fetches what it needs with
`useEffect`.

## What's deliberately not built yet

- CV/cover-letter generation (Browser Rendering + HTML templates replacing
  LaTeX) -- Phase 5 in the plan.
- Application tracker, company research, salary routes -- Phase 6.
- LinkedIn and the four Danish portals' scrapers -- ported the same way as
  `lib/scrapers/freehire.ts`, registered in `lib/scrapers/registry.ts`, but
  deferred (LinkedIn especially, given anti-scraping risk at platform scale).
- Vectorize (semantic job search/dedupe) -- exact-key dedupe covers MVP.
- Gmail sync, Notion sync -- would need Worker-side OAuth, out of scope for
  now.
