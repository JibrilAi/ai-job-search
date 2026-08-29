import { Hono } from "hono"
import type { Env, RankQueueMessage } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import { listRankedJobFeedForUser } from "../lib/db/repositories/rankings.js"
import { getJob } from "../lib/db/repositories/jobs.js"
import { ensureRankingPlaceholder } from "../lib/db/repositories/rankings.js"

const rankings = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
rankings.use("*", requireAuth)

rankings.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? "50")
  const offset = Number(c.req.query("offset") ?? "0")
  const feed = await listRankedJobFeedForUser(c.env, c.get("userId"), { limit, offset })
  return c.json({ rankings: feed })
})

/** Manual on-demand re-rank for one job (e.g. after the user edits their profile). */
rankings.post("/:jobId/re-rank", async (c) => {
  const jobId = c.req.param("jobId")
  const job = await getJob(c.env, jobId)
  if (!job) return c.json({ error: "job not found" }, 404)

  const userId = c.get("userId")
  await ensureRankingPlaceholder(c.env, userId, jobId)
  const message: RankQueueMessage = { userId, jobId }
  await c.env.RANK_QUEUE.send(message)
  return c.json({ ok: true, queued: true })
})

export default rankings
