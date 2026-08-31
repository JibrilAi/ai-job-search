import type { Env } from "../../../types.js"

export const MIN_INTERVAL_MINUTES = 15
export const MAX_INTERVAL_MINUTES = 10080 // 1 week

export interface ScrapeSchedule {
  intervalMinutes: number
  lastRunAt: string | null
}

const DEFAULT_SCHEDULE: ScrapeSchedule = { intervalMinutes: 360, lastRunAt: null }

export async function getScrapeSchedule(env: Env): Promise<ScrapeSchedule> {
  const row = await env.DB.prepare(
    `SELECT interval_minutes as intervalMinutes, last_run_at as lastRunAt FROM scrape_schedule WHERE id = 1`,
  ).first<ScrapeSchedule>()
  return row ?? DEFAULT_SCHEDULE
}

export async function setScrapeIntervalMinutes(env: Env, intervalMinutes: number): Promise<void> {
  await env.DB.prepare(`UPDATE scrape_schedule SET interval_minutes = ? WHERE id = 1`).bind(intervalMinutes).run()
}

export async function markScrapeScheduleRun(env: Env, ranAt: string): Promise<void> {
  await env.DB.prepare(`UPDATE scrape_schedule SET last_run_at = ? WHERE id = 1`).bind(ranAt).run()
}
