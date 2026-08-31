import type { Env, ScrapeQueueMessage } from "./types.js"
import { listEnabledScrapeQueries } from "./lib/db/repositories/scrapeQueries.js"
import { getScrapeSchedule, markScrapeScheduleRun } from "./lib/db/repositories/scrapeSchedule.js"

/**
 * Cloudflare Cron Triggers are static config in wrangler.toml -- changing
 * one requires editing that file and redeploying, so it can't be the thing
 * an admin adjusts at runtime. Instead wrangler.toml's trigger fires on a
 * short, fixed heartbeat (see its `[triggers]` comment) and this handler is
 * the actual gate: it enumerates `scrape_queries` and fans work onto
 * SCRAPE_QUEUE only once `scrape_schedule.interval_minutes` (admin-editable
 * via PATCH /api/admin/schedule) has elapsed since the last real run -- the
 * actual HTTP scraping happens in the queue consumer
 * (queue-consumers/scrapeConsumer.ts), which gives per-portal retry/backoff
 * without one slow or blocked portal starving the others.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const schedule = await getScrapeSchedule(env)
  const now = new Date()
  if (schedule.lastRunAt) {
    const elapsedMinutes = (now.getTime() - new Date(schedule.lastRunAt).getTime()) / 60_000
    if (elapsedMinutes < schedule.intervalMinutes) return
  }
  await markScrapeScheduleRun(env, now.toISOString())

  const queries = await listEnabledScrapeQueries(env)
  if (queries.length === 0) return
  const messages: MessageSendRequest<ScrapeQueueMessage>[] = queries.map((q) => ({
    body: { scrapeQueryId: q.id, portal: q.portal, queryJson: q.queryJson },
  }))
  await env.SCRAPE_QUEUE.sendBatch(messages)
}
