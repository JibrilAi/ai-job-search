import type { Env } from "../../../types.js"

export interface ScrapeQueryRow {
  id: string
  portal: string
  queryJson: string
  enabled: number
  lastRunAt: string | null
}

export async function listEnabledScrapeQueries(env: Env): Promise<ScrapeQueryRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, portal, query_json as queryJson, enabled, last_run_at as lastRunAt
     FROM scrape_queries WHERE enabled = 1`,
  ).all<ScrapeQueryRow>()
  return results
}

export async function markScrapeQueryRun(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE scrape_queries SET last_run_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run()
}
