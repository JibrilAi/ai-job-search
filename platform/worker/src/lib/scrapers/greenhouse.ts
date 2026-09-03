// Greenhouse's public, unauthenticated per-company job-board API
// (`boards-api.greenhouse.io/v1/boards/{token}/jobs`) -- same risk profile
// as freehire.ts (a JSON API meant to be read programmatically, no auth,
// no ToS-violating browser automation). Unlike freehire.me, there is no
// single "search all Greenhouse jobs" endpoint -- each board is scoped to
// one company. `PortalSearchOpts.query` is repurposed here as a
// comma-separated list of Greenhouse board tokens (the slug in a
// company's board URL, e.g. "stripe" for boards.greenhouse.io/stripe)
// rather than a free-text keyword; this portal is deliberately NOT in
// KEYWORD_SEARCHABLE_PORTALS in registry.ts because of that different
// semantics. Relevance filtering happens downstream in the AI ranking
// pipeline, same as every other portal ("shared scrape, per-user
// matching" -- see docs/architecture.md), so this fetches each listed
// company's full open-jobs list rather than trying to filter here.
import type { PortalScraper, PortalSearchOpts, ScrapedJob } from "./types.js"

const BASE_URL = "https://boards-api.greenhouse.io/v1/boards"
const UA = "ai-job-search-platform/1.0 (+https://github.com/JibrilAi/ai-job-search)"

interface GreenhouseJob {
  id: number
  title: string
  absolute_url: string
  updated_at: string | null
  location?: { name?: string | null } | null
  content?: string | null
}

interface GreenhouseBoard {
  jobs: GreenhouseJob[]
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

function titleCase(token: string): string {
  return token
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ")
}

async function fetchBoard(token: string): Promise<GreenhouseBoard | null> {
  const url = `${BASE_URL}/${encodeURIComponent(token)}/jobs?content=true`
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
      throw new Error(`could not reach Greenhouse for board "${token}" (${e instanceof Error ? e.message : String(e)})`)
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Greenhouse API request failed for board "${token}": ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    // A 404 means this board token doesn't exist -- skip it rather than
    // failing the whole scrape over one bad/renamed token.
    if (response.status === 404) return null

    const body = (await response.json().catch(() => null)) as GreenhouseBoard | null
    if (!response.ok) {
      throw new Error(`Greenhouse API request failed for board "${token}": ${response.status} ${response.statusText}`)
    }
    return body
  }
  throw new Error(`Greenhouse API request failed for board "${token}" after retries`)
}

export function createGreenhouseScraper(): PortalScraper {
  return {
    portal: "greenhouse",
    async search(opts: PortalSearchOpts): Promise<ScrapedJob[]> {
      const tokens = (opts.query ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      if (tokens.length === 0) return []

      const boards = await Promise.all(tokens.map((token) => fetchBoard(token).then((board) => ({ token, board }))))

      const jobs: ScrapedJob[] = []
      for (const { token, board } of boards) {
        if (!board) continue
        for (const j of board.jobs ?? []) {
          jobs.push({
            externalId: `greenhouse-${token}-${j.id}`,
            title: j.title || "(untitled)",
            company: titleCase(token),
            location: j.location?.name?.trim() || null,
            description: cleanHtml(j.content),
            sourceUrl: j.absolute_url,
            deadline: null,
            postedAt: j.updated_at,
          })
        }
      }
      return jobs.slice(0, opts.limit ?? 200)
    },
  }
}
