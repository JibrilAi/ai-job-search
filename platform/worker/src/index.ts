import { Hono } from "hono"
import { cors } from "hono/cors"
import type { Env, RankQueueMessage, ScrapeQueueMessage } from "./types.js"
import authRoutes from "./routes/auth.js"
import profileRoutes from "./routes/profile.js"
import jobsRoutes from "./routes/jobs.js"
import rankingsRoutes from "./routes/rankings.js"
import documentsRoutes from "./routes/documents.js"
import applicationsRoutes from "./routes/applications.js"
import companyResearchRoutes from "./routes/companyResearch.js"
import salaryRoutes from "./routes/salary.js"
import adminRoutes from "./routes/admin.js"
import { handleScheduled } from "./scheduled.js"
import { handleScrapeMessage } from "./queue-consumers/scrapeConsumer.js"
import { handleRankMessage } from "./queue-consumers/rankConsumer.js"

const app = new Hono<{ Bindings: Env }>()

app.use("*", async (c, next) => {
  // FRONTEND_ORIGIN may be a comma-separated list, so adding another domain
  // (e.g. a custom domain alongside the *.pages.dev one) is a config change,
  // not a code change.
  const allowedOrigins = c.env.FRONTEND_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean)
  const middleware = cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : undefined),
    credentials: true,
  })
  return middleware(c, next)
})

app.get("/api/health", (c) => c.json({ ok: true }))
app.route("/api/auth", authRoutes)
app.route("/api/profile", profileRoutes)
app.route("/api/jobs", jobsRoutes)
app.route("/api/rankings", rankingsRoutes)
app.route("/api/documents", documentsRoutes)
app.route("/api/applications", applicationsRoutes)
app.route("/api/company-research", companyResearchRoutes)
app.route("/api/salary", salaryRoutes)
app.route("/api/admin", adminRoutes)

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env)
  },

  async queue(batch: MessageBatch<ScrapeQueueMessage | RankQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (batch.queue.startsWith("scrape-portal")) {
          await handleScrapeMessage(env, message.body as ScrapeQueueMessage)
        } else if (batch.queue.startsWith("rank-job")) {
          await handleRankMessage(env, message.body as RankQueueMessage)
        }
        message.ack()
      } catch (err) {
        console.error(`queue consumer error on ${batch.queue}:`, err)
        message.retry()
      }
    }
  },
}
