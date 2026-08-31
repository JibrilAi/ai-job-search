import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import { getProfile, upsertProfile, type ProfileInput } from "../lib/db/repositories/profiles.js"
import { extractPdfText } from "../lib/documents/extractText.js"
import { extractProfileFromResumeText } from "../lib/profile/resumeExtraction.js"
import { suggestScrapeQuery } from "../lib/scrapeQuerySuggestion.js"
import { getUserScrapeQueries, upsertUserScrapeQuery } from "../lib/db/repositories/scrapeQueries.js"
import { KEYWORD_SEARCHABLE_PORTALS } from "../lib/scrapers/registry.js"

const MAX_RESUME_BYTES = 10 * 1024 * 1024

const profile = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
profile.use("*", requireAuth)

profile.get("/", async (c) => {
  const p = await getProfile(c.env, c.get("userId"))
  return c.json({ profile: p })
})

profile.put("/", async (c) => {
  const body = await c.req.json<ProfileInput>().catch(() => null)
  if (!body) return c.json({ error: "invalid profile payload" }, 400)
  const saved = await upsertProfile(c.env, c.get("userId"), body)
  return c.json({ profile: saved })
})

// Extracts a best-effort profile from an uploaded resume PDF and returns it
// for the frontend to prefill into the form -- does NOT save it, so a bad
// or incomplete extraction never silently overwrites the user's real profile.
profile.post("/resume", async (c) => {
  const body = await c.req.parseBody().catch(() => null)
  const file = body?.resume
  if (!(file instanceof File)) return c.json({ error: "resume file is required (multipart field name: resume)" }, 400)
  if (file.type !== "application/pdf") return c.json({ error: "resume must be a PDF" }, 400)
  if (file.size > MAX_RESUME_BYTES) return c.json({ error: "resume PDF is too large (max 10MB)" }, 400)

  let text: string
  try {
    text = await extractPdfText(await file.arrayBuffer())
  } catch {
    return c.json({ error: "could not read text from this PDF" }, 400)
  }
  if (text.trim().length < 50) {
    return c.json({ error: "could not extract enough text from this PDF (is it a scanned image?)" }, 400)
  }

  try {
    const extracted = await extractProfileFromResumeText(c.env, text)
    return c.json({ profile: extracted })
  } catch (err) {
    console.error("resume extraction failed:", err)
    return c.json({ error: "could not extract a profile from this resume, please fill it in manually" }, 502)
  }
})

// Auto-suggested (from the saved profile's skills/domain/target sectors) but
// user-editable search scope -- without this, every user's job pool is built
// entirely from a couple of broad, untargeted admin-seeded scrape_queries
// rows (see migrations/0002 and 0006), which skew toward whatever those
// portals surface by default rather than any individual user's actual field.
profile.get("/search-preferences", async (c) => {
  const userId = c.get("userId")
  const [p, existing] = await Promise.all([getProfile(c.env, userId), getUserScrapeQueries(c.env, userId)])
  const suggestion = p ? suggestScrapeQuery(p) : { query: "", location: null }
  const saved = existing[0] ? (JSON.parse(existing[0].queryJson) as { query?: string; location?: string | null }) : null
  return c.json({
    suggestion,
    saved: saved ? { query: saved.query ?? "", location: saved.location ?? null, enabled: !!existing[0].enabled } : null,
  })
})

profile.put("/search-preferences", async (c) => {
  const body = await c.req.json<{ query?: string; location?: string | null; enabled?: boolean }>().catch(() => null)
  if (!body || typeof body.query !== "string") return c.json({ error: "query is required" }, 400)

  const userId = c.get("userId")
  const enabled = body.enabled ?? true
  const queryJson = JSON.stringify({ query: body.query, location: body.location ?? null, jobage: 7, limit: 25 })

  await Promise.all(
    KEYWORD_SEARCHABLE_PORTALS.map((portal) => upsertUserScrapeQuery(c.env, userId, portal, queryJson, enabled)),
  )
  return c.json({ ok: true })
})

export default profile
