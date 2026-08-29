import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import { getJob, listJobs } from "../lib/db/repositories/jobs.js"
import { getRanking } from "../lib/db/repositories/rankings.js"

const jobs = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
jobs.use("*", requireAuth)

jobs.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? "50")
  const offset = Number(c.req.query("offset") ?? "0")
  const rows = await listJobs(c.env, { limit, offset })
  return c.json({ jobs: rows })
})

jobs.get("/:id", async (c) => {
  const id = c.req.param("id")
  const job = await getJob(c.env, id)
  if (!job) return c.json({ error: "job not found" }, 404)
  const ranking = await getRanking(c.env, c.get("userId"), id)
  return c.json({ job, ranking })
})

export default jobs
