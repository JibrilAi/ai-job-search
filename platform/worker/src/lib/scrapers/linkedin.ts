// Ported from .agents/skills/linkedin-search/cli/src/{helpers.ts,commands/search.ts,commands/detail.ts}.
// LinkedIn's public, unauthenticated "jobs-guest" endpoints -- no login required.
//
// Open risk: LinkedIn actively rate-limits/blocks scraping, and unlike local
// use (one person's residential IP), this scraper runs from Cloudflare's
// shared server IPs on behalf of every platform user at once -- getting
// flagged risks degrading the scraper for everyone, not just one account.
// Mitigations: search cards alone carry no description (only each job's own
// detail page does), so detail fetches are capped per run and spaced out
// rather than fetched for every card, unlike freehire's single-request search.
import type { PortalScraper, PortalSearchOpts, ScrapedJob } from "./types.js"

const SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
const DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting"
const UA = "Mozilla/5.0 (compatible; ai-job-search-platform/1.0)"
const MAX_DETAIL_FETCHES = 10
const DETAIL_DELAY_MS = 400

async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 4
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "X-Requested-With": "XMLHttpRequest",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      throw new Error(`could not reach LinkedIn (${e instanceof Error ? e.message : String(e)})`)
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`LinkedIn request failed: ${response.status} ${response.statusText}`)
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) throw new Error(`LinkedIn request failed: ${response.status} ${response.statusText}`)
    return response.text()
  }
  throw new Error("LinkedIn request failed after retries")
}

function numericEntity(codePoint: number): string {
  return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Extracts the inner HTML of a <div> by class name, tracking tag depth so nested <div>s don't truncate it early. */
function extractDivContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(open.index + open[0].length, i - 6)
}

interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

/** Parses the search response: a flat list of <li> job cards, split on each posting's URN. */
function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/data-entity-urn="urn:li:jobPosting:/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const linkMatch = chunk.match(/class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/i)
    const url = linkMatch ? decodeHtmlEntities(linkMatch[1]).split("?")[0] : ""

    let title: string | null = null
    const h3 = chunk.match(/class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/i)
    if (h3) title = clean(h3[1])
    if (!title) {
      const sr = chunk.match(/class="sr-only"[^>]*>([\s\S]*?)<\/span>/i)
      if (sr) title = clean(sr[1])
    }
    if (!title) continue

    let company: string | null = null
    const sub = chunk.match(/class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i)
    if (sub) company = clean(sub[1]) || null

    const loc = chunk.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i)
    const location = loc ? clean(loc[1]) || null : null
    const dt = chunk.match(/class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/i)
    const date = dt ? dt[1] : null

    results.push({ id, title, company, location, date, url: url || `https://www.linkedin.com/jobs/view/${id}` })
  }
  return results
}

function parseJobDescription(html: string): string | null {
  const descHtml = extractDivContent(html, "show-more-less-html__markup") ?? extractDivContent(html, "description__text")
  if (!descHtml) return null
  const withBreaks = descHtml.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() || null
}

function jobageToTPR(days: number | undefined): string | null {
  if (!days || days <= 0 || days >= 9999) return null
  return `r${days * 86400}`
}

export function createLinkedinScraper(): PortalScraper {
  return {
    portal: "linkedin",
    async search(opts: PortalSearchOpts): Promise<ScrapedJob[]> {
      const params = new URLSearchParams()
      if (opts.query) params.set("keywords", opts.query)
      if (opts.location) params.set("location", opts.location)
      const tpr = jobageToTPR(opts.jobage)
      if (tpr) params.set("f_TPR", tpr)
      params.set("start", "0")

      const html = await htmlFetch(`${SEARCH_URL}?${params.toString()}`)
      let cards = parseJobCards(html)
      if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

      const jobs: ScrapedJob[] = []
      for (const [i, card] of cards.entries()) {
        let description: string | null = null
        if (i < MAX_DETAIL_FETCHES) {
          if (i > 0) await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS))
          try {
            const detailHtml = await htmlFetch(`${DETAIL_URL}/${card.id}`)
            description = parseJobDescription(detailHtml)
          } catch {
            // A failed detail fetch shouldn't drop the job from the run --
            // rank it on title/company/location alone rather than lose it.
          }
        }
        jobs.push({
          externalId: card.id,
          title: card.title,
          company: card.company || "(unknown company)",
          location: card.location,
          description,
          sourceUrl: card.url,
          deadline: null,
          postedAt: card.date,
        })
      }
      return jobs
    },
  }
}
