# AI Job Search Platform (Cloudflare)

A hosted, multi-user version of this repo's job-search workflow, built on
Cloudflare Workers, D1, KV, R2, and Queues. This is a new app that lives
alongside the existing local Claude Code skills (`.claude/`, `.agents/`,
`cv/`, `cover_letters/`) -- it does not replace them. See
`/root/.claude/plans/can-you-inspect-the-majestic-sphinx.md` in the session
that built this (or `docs/architecture.md` below) for the full design.

## What's here

- `worker/` -- a Cloudflare Worker: REST API (`/api/*`), a Cron-triggered
  scraper, and two Queue consumers (scraping, AI ranking).
- `frontend/` -- a React + Vite app (deploys to Cloudflare Pages): auth,
  profile setup, and a job feed/detail dashboard.
- `migrations/` -- D1 schema, applied in order (`0001`..`0005`).
- `docs/` -- architecture notes and the local-data-to-D1 migration mapping.

## Status

Built and verified end-to-end in local dev (`wrangler dev --local` + Vite,
against local D1/KV/Queue emulation, plus a real reachability check against
`api.anthropic.com`):

- **Auth** -- signup, login, magic link, sessions (D1-backed, PBKDF2 password
  hashing via Web Crypto).
- **Profile** -- full CRUD, mirrors CLAUDE.md's Candidate Profile shape.
- **Scraper** -- freehire.me portal ported to a Worker, Cron -> Queue ->
  dedupe-on-upsert into the shared `jobs` table. (LinkedIn and the Danish
  portals are not ported yet -- see Known limitations.)
- **AI ranking** -- reproduces `04-job-evaluation.md`'s rubric, calls the
  Claude API directly with forced structured output, fans out per (user, job)
  via a Queue, writes weighted scores + verdicts + gate results to
  `user_job_rankings`.
- **Dashboard** -- React job feed (ranked, badge-annotated) and job detail
  (score breakdown, strengths/gaps, gate explanations, manual re-rank).

**Not yet built** (see the plan's Phase 5/6): CV/cover-letter generation
(Browser Rendering + HTML templates), the application tracker, company
research and salary routes.

## Local development

```bash
cd platform
npm install                              # installs both workspaces

# One-time: create real Cloudflare resources and paste their IDs into
# worker/wrangler.toml (see the comment block at the top of that file),
# then set local secrets:
cp worker/.dev.vars.example worker/.dev.vars   # fill in a real ANTHROPIC_API_KEY etc.

npm run db:migrate:local                 # applies migrations/*.sql to local D1
npm run dev:worker                       # wrangler dev, http://localhost:8787
npm run dev:frontend                     # vite dev, http://localhost:5173 (proxies /api)
```

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
of that file), and `npm run db:migrate:remote` to apply migrations to the
production D1 database.

## Known limitations / open risks

- Only the `freehire` portal is wired up. Adding another portal means writing
  `worker/src/lib/scrapers/<portal>.ts` (same `PortalScraper` interface) and
  registering it in `worker/src/lib/scrapers/registry.ts`. LinkedIn is
  deliberately deferred -- see the plan's risk notes on scraping-at-scale.
- Magic-link/password-reset email falls back to `console.log` when
  `RESEND_API_KEY` is unset (see `worker/src/lib/auth/email.ts`) -- fine for
  dev, but needs a real Resend account + verified sending domain before
  magic links work for real users.
- No rate limiting yet on auth endpoints (`AUTH_KV` is wired up for this but
  unused so far).
- The Claude API call was verified against the real endpoint (auth error
  with a placeholder key, confirming the request reaches Anthropic and is
  shaped correctly) and against a fully mocked response in
  `worker/test/claude-client.test.ts`, but not against a live successful
  ranking -- do that first with a real `ANTHROPIC_API_KEY` before relying on
  ranking quality.
