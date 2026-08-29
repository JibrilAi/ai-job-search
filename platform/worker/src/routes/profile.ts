import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import { getProfile, upsertProfile, type ProfileInput } from "../lib/db/repositories/profiles.js"

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

export default profile
