import type { Env } from "../../../types.js"

// TTL mirrors 04-job-evaluation.md's Company Research Cache section: 30 days
// from fetched_date, shared across users (the same company doesn't need
// re-researching per user).
const TTL_DAYS = 30

export interface CompanyResearchRow {
  companyNormalized: string
  companyDisplay: string | null
  fetchedDate: string
  sources: Record<string, { url?: string; notes?: string }>
  networkContactsNote: string | null
}

export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-")
}

export async function getCompanyResearch(env: Env, company: string): Promise<CompanyResearchRow | null> {
  const key = normalizeCompanyName(company)
  const row = await env.DB.prepare(
    `SELECT company_normalized as companyNormalized, company_display as companyDisplay, fetched_date as fetchedDate,
            sources_json as sourcesJson, network_contacts_note as networkContactsNote
     FROM company_research_cache WHERE company_normalized = ?`,
  )
    .bind(key)
    .first<{
      companyNormalized: string
      companyDisplay: string | null
      fetchedDate: string
      sourcesJson: string
      networkContactsNote: string | null
    }>()
  if (!row) return null

  const ageDays = (Date.now() - new Date(row.fetchedDate).getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays > TTL_DAYS) return null // stale -- caller should treat this as a cache miss

  return {
    companyNormalized: row.companyNormalized,
    companyDisplay: row.companyDisplay,
    fetchedDate: row.fetchedDate,
    sources: JSON.parse(row.sourcesJson),
    networkContactsNote: row.networkContactsNote,
  }
}

export async function upsertCompanyResearch(
  env: Env,
  company: string,
  sources: Record<string, { url?: string; notes?: string }>,
  networkContactsNote?: string | null,
): Promise<void> {
  const key = normalizeCompanyName(company)
  await env.DB.prepare(
    `INSERT INTO company_research_cache (company_normalized, company_display, fetched_date, sources_json, network_contacts_note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(company_normalized) DO UPDATE SET
       company_display = excluded.company_display, fetched_date = excluded.fetched_date,
       sources_json = excluded.sources_json, network_contacts_note = excluded.network_contacts_note`,
  )
    .bind(key, company, new Date().toISOString().slice(0, 10), JSON.stringify(sources), networkContactsNote ?? null)
    .run()
}
