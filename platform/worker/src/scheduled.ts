import type { Env, ScrapeQueueMessage } from "./types.js"
import { listEnabledScrapeQueries } from "./lib/db/repositories/scrapeQueries.js"

/**
 * Cron Triggers take no arguments, so this just enumerates configured
 * `scrape_queries` rows and enqueues one message per row onto
 * SCRAPE_QUEUE -- the actual HTTP scraping happens in the queue consumer
 * (queue-consumers/scrapeConsumer.ts), which gives per-portal retry/backoff
 * without one slow or blocked portal starving the others.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const queries = await listEnabledScrapeQueries(env)
  const messages: MessageSendRequest<ScrapeQueueMessage>[] = queries.map((q) => ({
    body: { scrapeQueryId: q.id, portal: q.portal, queryJson: q.queryJson },
  }))
  if (messages.length === 0) return
  await env.SCRAPE_QUEUE.sendBatch(messages)
}
