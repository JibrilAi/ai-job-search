export interface Env {
  DB: D1Database
  AUTH_KV: KVNamespace
  DOCUMENTS_BUCKET: R2Bucket
  BROWSER: Fetcher
  SCRAPE_QUEUE: Queue<ScrapeQueueMessage>
  RANK_QUEUE: Queue<RankQueueMessage>

  ENVIRONMENT: string
  FRONTEND_ORIGIN: string

  ANTHROPIC_API_KEY: string
  SESSION_SECRET: string
  MAGIC_LINK_SECRET: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  TURNSTILE_SECRET_KEY?: string
}

export interface ScrapeQueueMessage {
  scrapeQueryId: string
  portal: string
  queryJson: string
}

export interface RankQueueMessage {
  userId: string
  jobId: string
}
