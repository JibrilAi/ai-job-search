import type { Env } from "../../../types.js"
import { dedupeKey } from "../../dedupe.js"
import type { ScrapedJob } from "../../scrapers/types.js"

export interface JobRow {
  id: string
  dedupeKey: string
  portal: string
  sourceUrl: string
  title: string
  company: string
  location: string | null
  description: string | null
  deadline: string | null
  firstSeen: string
  lastSeen: string
  status: string
}

const SELECT_COLUMNS = `id, dedupe_key as dedupeKey, portal, source_url as sourceUrl, title, company,
  location, description, deadline, first_seen as firstSeen, last_seen as lastSeen, status`

export async function getJob(env: Env, id: string): Promise<JobRow | null> {
  return env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM jobs WHERE id = ?`).bind(id).first<JobRow>()
}

export async function listJobs(
  env: Env,
  opts: { limit?: number; offset?: number; status?: string } = {},
): Promise<JobRow[]> {
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0
  const status = opts.status ?? "active"
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLUMNS} FROM jobs WHERE status = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
  )
    .bind(status, limit, offset)
    .all<JobRow>()
  return results
}

/**
 * Upserts a scraped job on its dedupe key. Returns the row id and whether it
 * was newly inserted (a new insert is what triggers the AI-ranking fan-out).
 */
export async function upsertScrapedJob(
  env: Env,
  portal: string,
  scraped: ScrapedJob,
): Promise<{ id: string; isNew: boolean }> {
  const key = await dedupeKey(portal, scraped.title, scraped.company)
  const now = new Date().toISOString()

  const existing = await env.DB.prepare(`SELECT id FROM jobs WHERE dedupe_key = ?`).bind(key).first<{ id: string }>()
  if (existing) {
    await env.DB.prepare(
      `UPDATE jobs SET last_seen = ?, status = 'active', description = COALESCE(?, description) WHERE id = ?`,
    )
      .bind(now, scraped.description, existing.id)
      .run()
    return { id: existing.id, isNew: false }
  }

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO jobs (id, dedupe_key, portal, source_url, title, company, location, description,
       deadline, first_seen, last_seen, status, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind(
      id,
      key,
      portal,
      scraped.sourceUrl,
      scraped.title,
      scraped.company,
      scraped.location,
      scraped.description,
      scraped.deadline,
      now,
      now,
      JSON.stringify(scraped),
    )
    .run()
  return { id, isNew: true }
}
