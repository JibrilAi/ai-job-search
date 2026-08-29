// Ported from .agents/skills/freehire-search/cli/src/{helpers.ts,commands/search.ts}.
// freehire.me's public JSON API (unauthenticated, `{data, meta}` envelope) --
// the lowest-risk portal to scrape at platform scale (see the plan's Open
// Risks: LinkedIn's anti-scraping posture makes it a later, feature-flagged
// addition, not this one).
import type { PortalScraper, PortalSearchOpts, ScrapedJob } from "./types.js"

const DEFAULT_BASE_URL = "https://freehire.me"
const SEARCH_PATH = "/api/v1/agent/jobs/search"
const UA = "ai-job-search-platform/1.0 (+https://freehire.me)"

interface Envelope<T> {
  data: T
  meta?: { total?: number; limit?: number; offset?: number }
  error?: string
}

interface FreehireJob {
  public_slug: string
  url: string
  title: string
  company: string
  location: string
  description: string
  posted_at: string | null
  created_at: string | null
}

async function apiGet<T>(baseUrl: string, path: string): Promise<Envelope<T> | null> {
  const url = `${baseUrl}${path}`
  const maxRetries = 4
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
      throw new Error(`could not reach the freehire API at ${baseUrl} (${e instanceof Error ? e.message : String(e)})`)
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`freehire API request failed: ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null

    const body = (await response.json().catch(() => null)) as Envelope<T> | null
    if (!response.ok) {
      throw new Error(body?.error || `freehire API request failed: ${response.status} ${response.statusText}`)
    }
    if (!body) throw new Error("freehire API returned an unparseable response body")
    return body
  }
  throw new Error("freehire API request failed after retries")
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function cleanHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

export function createFreehireScraper(baseUrlOverride?: string): PortalScraper {
  const baseUrl = (baseUrlOverride || DEFAULT_BASE_URL).replace(/\/+$/, "")

  return {
    portal: "freehire",
    async search(opts: PortalSearchOpts): Promise<ScrapedJob[]> {
      const params = new URLSearchParams()
      if (opts.query) params.set("q", opts.query)
      params.set("limit", String(opts.limit ?? 50))
      params.set("offset", "0")
      params.set("semantic_ratio", "0")
      params.set("include_description", "true")
      params.set("description_format", "text")
      if (opts.jobage && opts.jobage > 0 && opts.jobage < 9999) {
        params.set("posted_within_days", String(opts.jobage))
      }

      const env = await apiGet<FreehireJob[]>(baseUrl, `${SEARCH_PATH}?${params.toString()}`)
      if (!env) return []

      return (env.data ?? []).map((j) => ({
        externalId: j.public_slug,
        title: j.title || "(untitled)",
        company: j.company || "(unknown company)",
        location: j.location || null,
        description: cleanHtml(j.description),
        sourceUrl: j.url,
        deadline: null,
        postedAt: j.posted_at,
      }))
    },
  }
}
