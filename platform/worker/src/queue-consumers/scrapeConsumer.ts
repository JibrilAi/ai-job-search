import type { Env, RankQueueMessage, ScrapeQueueMessage } from "../types.js"
import { getScraper } from "../lib/scrapers/registry.js"
import { upsertScrapedJob } from "../lib/db/repositories/jobs.js"
import { markScrapeQueryRun } from "../lib/db/repositories/scrapeQueries.js"
import { listUserIdsWithProfile } from "../lib/db/repositories/profiles.js"

/**
 * Consumes one `scrape-portal-queue` message: runs the named portal's
 * scraper, upserts each result into the shared `jobs` table (deduped on
 * dedupe_key), and for genuinely new jobs fans out one `rank-job-queue`
 * message per user with a saved profile -- shared scrape, per-user matching
 * (the plan's decision #8).
 */
export async function handleScrapeMessage(env: Env, message: ScrapeQueueMessage): Promise<void> {
  const scraper = getScraper(message.portal)
  if (!scraper) {
    throw new Error(`no scraper registered for portal "${message.portal}"`)
  }

  const query = JSON.parse(message.queryJson) as { query?: string; jobage?: number; limit?: number; location?: string }
  const results = await scraper.search(query)

  const newJobIds: string[] = []
  for (const scraped of results) {
    const { id, isNew } = await upsertScrapedJob(env, message.portal, scraped)
    if (isNew) newJobIds.push(id)
  }

  await markScrapeQueryRun(env, message.scrapeQueryId)

  if (newJobIds.length === 0) return

  const userIds = await listUserIdsWithProfile(env)
  if (userIds.length === 0) return

  const rankMessages: MessageSendRequest<RankQueueMessage>[] = []
  for (const jobId of newJobIds) {
    for (const userId of userIds) {
      rankMessages.push({ body: { userId, jobId } })
    }
  }
  // Queues cap batch size at 100 messages per sendBatch call.
  for (let i = 0; i < rankMessages.length; i += 100) {
    await env.RANK_QUEUE.sendBatch(rankMessages.slice(i, i + 100))
  }
}
