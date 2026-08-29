import type { Env } from "../../../types.js"

export interface SalaryRow {
  id: string
  company: string
  city: string | null
  category: string | null
  indexValue: number | null
  metadata: Record<string, unknown> | null
}

/** Looks up salary benchmark rows for a company, optionally narrowed by city -- mirrors salary_lookup.py's interface. */
export async function lookupSalary(env: Env, company: string, city?: string): Promise<SalaryRow[]> {
  const query = city
    ? env.DB.prepare(`SELECT id, company, city, category, index_value as indexValue, metadata_json as metadataJson
                       FROM salary_data WHERE company = ? AND city = ?`).bind(company, city)
    : env.DB.prepare(`SELECT id, company, city, category, index_value as indexValue, metadata_json as metadataJson
                       FROM salary_data WHERE company = ?`).bind(company)

  const { results } = await query.all<{
    id: string
    company: string
    city: string | null
    category: string | null
    indexValue: number | null
    metadataJson: string | null
  }>()

  return results.map((r) => ({
    id: r.id,
    company: r.company,
    city: r.city,
    category: r.category,
    indexValue: r.indexValue,
    metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
  }))
}
