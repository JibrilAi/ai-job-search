// Lever's public, unauthenticated per-company postings API
// (`api.lever.co/v0/postings/{company}`) -- same shape and reasoning as
// greenhouse.ts: a per-company board, no global search, so
// `PortalSearchOpts.query` is repurposed as a comma-separated list of
// Lever company slugs (the slug in a company's board URL, e.g. "netflix"
// for jobs.lever.co/netflix) rather than a free-text keyword. Not in
// KEYWORD_SEARCHABLE_PORTALS for the same reason. See greenhouse.ts for
// the fuller explanation shared by both.
import type { PortalScraper, PortalSearchOpts, ScrapedJob } from "./types.js"

const BASE_URL = "https://api.lever.co/v0/postings"
const UA = "ai-job-search-platform/1.0 (+https://github.com/JibrilAi/ai-job-search)"

interface LeverPosting {
  id: string
  text: string
  hostedUrl: string
  createdAt: number | null
  categories?: { location?: string | null } | null
  descriptionPlain?: string | null
  description?: string | null
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ")
}

async function fetchPostings(company: string): Promise<LeverPosting[] | null> {
  const url = `${BASE_URL}/${encodeURIComponent(company)}?mode=json`
  const maxRetries = 3
  let delay = 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      throw new Error(`could not reach Lever for company "${company}" (${e instanceof Error ? e.message : String(e)})`)
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Lever API request failed for company "${company}": ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    // A 404 means this company has no Lever board (bad/renamed slug) --
    // skip it rather than failing the whole scrape over one bad slug.
    if (response.status === 404) return null

    const body = (await response.json().catch(() => null)) as LeverPosting[] | null
    if (!response.ok) {
      throw new Error(`Lever API request failed for company "${company}": ${response.status} ${response.statusText}`)
    }
    return body
  }
  throw new Error(`Lever API request failed for company "${company}" after retries`)
}

export function createLeverScraper(): PortalScraper {
  return {
    portal: "lever",
    async search(opts: PortalSearchOpts): Promise<ScrapedJob[]> {
      const companies = (opts.query ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
      if (companies.length === 0) return []

      const results = await Promise.all(
        companies.map((company) => fetchPostings(company).then((postings) => ({ company, postings }))),
      )

      const jobs: ScrapedJob[] = []
      for (const { company, postings } of results) {
        if (!postings) continue
        for (const p of postings) {
          jobs.push({
            externalId: `lever-${company}-${p.id}`,
            title: p.text || "(untitled)",
            company: titleCase(company),
            location: p.categories?.location?.trim() || null,
            description: (p.descriptionPlain || p.description || "").trim() || null,
            sourceUrl: p.hostedUrl,
            deadline: null,
            postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          })
        }
      }
      return jobs.slice(0, opts.limit ?? 200)
    },
  }
}
