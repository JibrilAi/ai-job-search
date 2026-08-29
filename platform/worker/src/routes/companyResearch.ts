import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import { getCompanyResearch, upsertCompanyResearch } from "../lib/db/repositories/companyResearch.js"

const companyResearch = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
companyResearch.use("*", requireAuth)

companyResearch.get("/:company", async (c) => {
  const research = await getCompanyResearch(c.env, decodeURIComponent(c.req.param("company")))
  return c.json({ research })
})

// Manual cache write -- lets the frontend (or a future research agent) save
// findings so the next lookup for this company, by any user, hits the cache.
companyResearch.put("/:company", async (c) => {
  const company = decodeURIComponent(c.req.param("company"))
  const body = await c.req.json<{ sources?: Record<string, { url?: string; notes?: string }>; networkContactsNote?: string }>().catch(
    () => null,
  )
  if (!body?.sources) return c.json({ error: "sources is required" }, 400)
  await upsertCompanyResearch(c.env, company, body.sources, body.networkContactsNote)
  return c.json({ ok: true })
})

export default companyResearch
