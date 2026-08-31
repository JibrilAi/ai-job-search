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

/** The admin-seeded global queries (owner_user_id IS NULL) -- the ones the schedule dashboard shows, not every user's personal search preferences. */
export async function listGlobalScrapeQueries(env: Env): Promise<ScrapeQueryRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, portal, query_json as queryJson, enabled, last_run_at as lastRunAt
     FROM scrape_queries WHERE owner_user_id IS NULL ORDER BY portal`,
  ).all<ScrapeQueryRow>()
  return results
}

export interface UserScrapeQueryRow extends ScrapeQueryRow {
  ownerUserId: string
}

export async function getUserScrapeQueries(env: Env, userId: string): Promise<UserScrapeQueryRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, portal, query_json as queryJson, enabled, last_run_at as lastRunAt, owner_user_id as ownerUserId
     FROM scrape_queries WHERE owner_user_id = ?`,
  )
    .bind(userId)
    .all<UserScrapeQueryRow>()
  return results
}

/**
 * One row per (user, portal) -- a user's search preferences replace their
 * own prior query for that portal rather than accumulating duplicates,
 * while the global admin-seeded rows (owner_user_id NULL) are untouched.
 */
export async function upsertUserScrapeQuery(
  env: Env,
  userId: string,
  portal: string,
  queryJson: string,
  enabled: boolean,
): Promise<void> {
  const id = `user-${userId}-${portal}`
  await env.DB.prepare(
    `INSERT INTO scrape_queries (id, portal, query_json, enabled, owner_user_id) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET query_json = excluded.query_json, enabled = excluded.enabled`,
  )
    .bind(id, portal, queryJson, enabled ? 1 : 0, userId)
    .run()
}
