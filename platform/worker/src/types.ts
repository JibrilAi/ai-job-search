export interface Env {
  DB: D1Database
  AUTH_KV: KVNamespace
  DOCUMENTS_BUCKET: R2Bucket
  BROWSER: Fetcher
  SCRAPE_QUEUE: Queue<ScrapeQueueMessage>
  RANK_QUEUE: Queue<RankQueueMessage>

  ENVIRONMENT: string
  // Comma-separated list of origins the CORS check accepts requests from --
  // NOT for building links (see APP_ORIGIN).
  FRONTEND_ORIGIN: string
  // The single canonical frontend URL used to build outbound links (magic
  // link, welcome email CTA, etc). Deliberately separate from
  // FRONTEND_ORIGIN, which can hold multiple comma-separated origins.
  APP_ORIGIN: string

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
