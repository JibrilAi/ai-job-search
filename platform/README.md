# AI Job Search Platform (Cloudflare)

A hosted, multi-user version of this repo's job-search workflow, built on
Cloudflare Workers, D1, KV, R2, Queues, and Browser Rendering. This is a new
app that lives alongside the existing local Claude Code skills (`.claude/`,
`.agents/`, `cv/`, `cover_letters/`) -- it does not replace them. See
`docs/architecture.md` for the full design.

## What's here

- `worker/` -- a Cloudflare Worker: REST API (`/api/*`), a Cron-triggered
  scraper, two Queue consumers (scraping, AI ranking), and CV/cover-letter
  PDF generation via Browser Rendering.
- `frontend/` -- a React + Vite app (deploys to Cloudflare Pages): auth,
  profile setup, job feed/detail, document studio, application tracker.
- `migrations/` -- D1 schema, applied in order.
- `docs/` -- architecture notes and the local-data-to-D1 migration mapping.

## Status

All of the following was built and verified end-to-end in local dev
(`wrangler dev --local` + Vite, against local D1/KV/R2/Queue emulation, a
**real headless Chrome** via Miniflare's Browser Rendering emulation, and a
real request against `generativelanguage.googleapis.com`) -- not just
typechecked:

- **Auth** -- signup, login, magic link, sessions (D1-backed, PBKDF2 password
  hashing via Web Crypto). Verified via curl and a real browser session
  (signup -> profile -> feed).
- **Profile** -- full CRUD, mirrors CLAUDE.md's Candidate Profile shape.
  Verified round-tripping through both the API and the React form.
- **Scraper** -- freehire.me portal ported to a Worker, Cron -> Queue ->
  dedupe-on-upsert into the shared `jobs` table. The Cron -> Queue -> upsert
  -> fan-out mechanics were verified locally (retry/backoff, drop-after-max
  behavior all confirmed); the actual freehire.me HTTP call could not be
  exercised from this sandbox (its network policy blocks that domain) -- see
  Known limitations. LinkedIn and the Danish portals are not ported yet.
- **AI ranking** -- reproduces `04-job-evaluation.md`'s rubric with forced
  structured JSON output, fans out per (user, job) via a queue, writes
  weighted scores/verdicts/gate results to `user_job_rankings`. Calls
  OpenRouter's free-model router (`openrouter/free`) as the primary LLM
  provider, falling back to Gemini automatically (`lib/llmClient.ts`) if
  OpenRouter fails -- see `docs/architecture.md` for why. Verified against a
  fully mocked response in `worker/test/llm-client.test.ts`,
  `worker/test/openrouter-client.test.ts`, and `worker/test/gemini-client.test.ts`.
  Do a real ranking with valid `OPENROUTER_API_KEY` (free at
  [openrouter.ai/keys](https://openrouter.ai/keys)) and `GEMINI_API_KEY`
  (free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
  before trusting ranking quality.
- **Dashboard** -- React job feed (ranked, badge-annotated) and job detail
  (score breakdown, strengths/gaps, gate explanations, manual re-rank).
  Verified visually with seeded ranking data through a real browser session.
- **CV/cover-letter generation** -- HTML/CSS templates (moderncv-banking
  and cover.cls look-alikes, embedding the project's actual Lato/Raleway
  fonts as base64 data URIs) rendered to PDF via the **Browser Rendering
  API**, stored in R2, and text-layer-verified with `unpdf`. This is the one
  piece that genuinely needed a live browser to prove out, and it was: a
  real CV PDF was generated end-to-end (headless Chrome -> PDF -> R2 ->
  downloaded -> visually inspected -> text layer confirmed selectable, 0
  ATS warnings). See "How the PDF pipeline was actually verified" below for
  the two real bugs this caught. Cover-letter drafting (an LLM call)
  verified the same way ranking was -- reaches the real API, fails cleanly
  on a placeholder key.
- **Application tracker** -- CRUD + status transitions following
  `outcome.md`'s status vocabulary, verified via curl and a real browser
  session (add an application, change its status, see it persist).
- **Company research cache / salary lookup** -- basic CRUD verified via
  curl.

### How the PDF pipeline was actually verified (and two bugs it caught)

Local `wrangler dev` can genuinely launch headless Chrome for Browser
Rendering -- Miniflare downloads and runs a real browser. Two real,
non-obvious bugs turned up doing this, both now fixed:

1. **pdfjs-dist's default build refuses to run without a Web Worker**, which
   the Workers runtime doesn't provide (`No "GlobalWorkerOptions.workerSrc"
   specified`, then a failed dynamic `import()` when a workerSrc was forced).
   Fixed by switching the ATS text-layer check from raw `pdfjs-dist` to
   `unpdf`, which bundles a PDF.js build meant for serverless/edge runtimes
   with no Worker/DOM dependency.
2. **The generated PDF's `ArrayBuffer` was empty after ATS verification ran**,
   because `unpdf`/pdf.js detaches (transfers) the buffer it's given. The
   route verified the PDF, *then* uploaded the same (now-empty) buffer to R2,
   producing a 0-byte file. Fixed by passing `pdf.slice(0)` (an independent
   copy) into `verifyAtsTextLayer`, keeping the original intact for the R2
   upload. See `worker/src/routes/documents.ts`.

Both were caught only because this was run against a real browser and a real
generated PDF, not just typechecked -- exactly the risk the original plan
flagged ("do not assume Browser-Rendering-generated PDFs always have a clean
text layer... verify this empirically").

## Local development

```bash
cd platform
npm install                              # installs both workspaces

# One-time: create real Cloudflare resources and paste their IDs into
# worker/wrangler.toml (see the comment block at the top of that file),
# then set local secrets:
cp worker/.dev.vars.example worker/.dev.vars   # fill in real OPENROUTER_API_KEY, GEMINI_API_KEY, etc.

npm run db:migrate:local                 # applies migrations/*.sql to local D1
npm run dev:worker                       # wrangler dev, http://localhost:8787
npm run dev:frontend                     # vite dev, http://localhost:5173 (proxies /api)
```

If `wrangler dev` runs as root (e.g. in a container), Chrome refuses to
launch for Browser Rendering unless you set `CI=1` in the environment first
(Miniflare adds `--no-sandbox` when `process.env.CI` is set) -- e.g.
`CI=1 npm run dev:worker`. Not needed on a normal (non-root) machine.

`worker/.dev.vars` is gitignored -- never commit real secrets. In production,
secrets are set with `wrangler secret put <NAME>` (see `wrangler.toml`'s
setup comment).

## Deploying

```bash
npm run deploy:worker      # wrangler deploy (worker/)
npm run deploy:frontend    # vite build + wrangler pages deploy (frontend/)
```

Requires the D1/KV/R2/Queues resources referenced in `worker/wrangler.toml`
to exist in your Cloudflare account first (see the setup comment at the top
of that file). Pushing to `master` (touching `worker/**` or `migrations/**`)
auto-deploys the Worker via `.github/workflows/deploy-worker.yml`, which
applies any new D1 migrations to the production database before deploying
the new code -- `npm run db:migrate:remote` is only for running one by hand
outside that flow (e.g. testing a migration against prod before merging).
The frontend (Pages) isn't wired into that workflow -- `npm run
deploy:frontend` remains a manual step unless the Pages project has its own
git-integration auto-deploy configured in the Cloudflare dashboard.

## Known limitations / open risks

- Four portals are wired up: `freehire`, `linkedin`, `greenhouse`, and
  `lever`. Adding another means writing `worker/src/lib/scrapers/<portal>.ts`
  (same `PortalScraper` interface) and registering it in
  `worker/src/lib/scrapers/registry.ts`. This sandbox's network policy
  blocks outbound requests to freehire.me, boards-api.greenhouse.io, and
  api.lever.co directly, so none of these scrapers' actual HTTP calls are
  verified here (the Cron/Queue/dedupe mechanics around them are); test
  against the real APIs before relying on them.
- `greenhouse`/`lever` are structured differently from the other two:
  Greenhouse and Lever are per-company job boards with no "search
  everything" endpoint, so their `scrape_queries.query_json`'s `query`
  field is a comma-separated list of company board tokens/slugs (not a
  free-text keyword) -- see the comment at the top of
  `worker/src/lib/scrapers/greenhouse.ts`. They're deliberately excluded
  from `KEYWORD_SEARCHABLE_PORTALS` for this reason. `migrations/
  0011_greenhouse_lever_seed.sql` seeds a starter list of company tokens
  that is best-effort/unverified (same network restriction as above) --
  confirm which actually resolve and swap in real ones relevant to your
  users.
- Magic-link/password-reset email falls back to `console.log` when
  `RESEND_API_KEY` is unset (see `worker/src/lib/auth/email.ts`) -- fine for
  dev, but needs a real Resend account + verified sending domain before
  magic links work for real users.
- No rate limiting yet on auth endpoints (`AUTH_KV` is wired up for this but
  unused so far).
- CV/cover-letter templates render from the stored profile as-is -- there is
  no LLM-driven bullet-selection/tailoring pass for the CV (the cover letter
  does get one, via `lib/documents/coverLetterDraft.ts`). A phone number
  field doesn't exist in the profile schema yet (the original LaTeX CV has
  one); add it to `profiles` + the Profile Setup form if needed.
- Custom CV/cover-letter template uploads (the `cv_templates`/
  `cover_letter_templates` tables exist for this) aren't built -- MVP
  rendering is code-driven, not template-driven.
- Gmail sync, Notion sync, Vectorize semantic search are out of scope (see
  `docs/architecture.md`).
- **freehire.me auto-submit** (`profile.autoSubmitMode`, `lib/documents/
  autoSubmit.ts`) is unverified against the real site -- same sandbox
  network restriction as the scraper above. Its form-field matching is a
  generic label/keyword heuristic, not freehire.me-specific selectors;
  treat the first deployment as a first attempt and expect to iterate once
  it's tested live. It also can't fill a phone number (no phone field
  exists in the profile schema yet, see above). Deliberately does not
  support LinkedIn or any other portal, even with the setting on -- see
  `docs/architecture.md`'s "Auto-apply and auto-submit" section.
- **Application-screener profile fields** (`migrations/
  0013_profile_application_fields.sql`: notice period, salary expectation,
  relocation willingness, work arrangement preference, portfolio URL) and
  `autoSubmit.ts`'s expanded `FIELD_KEYWORDS` matching for them are new and
  unverified against a real application form for the same reason as the
  rest of the auto-submit engine above. Deliberately does not add or
  auto-fill EEO/voluntary-self-identification fields (race, gender,
  veteran status, disability) -- see `NEVER_FILL_KEYWORDS` in
  `autoSubmit.ts` and `docs/architecture.md`.
