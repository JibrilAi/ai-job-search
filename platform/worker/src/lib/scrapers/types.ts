// Shared contract every portal scraper implements -- mirrors the search-result
// shape the local .agents/skills/*/cli tools already return, trimmed to the
// fields the shared `jobs` table needs.

export interface ScrapedJob {
  externalId: string
  title: string
  company: string
  location: string | null
  description: string | null
  sourceUrl: string
  deadline: string | null
  postedAt: string | null
}

export interface PortalSearchOpts {
  query?: string
  jobage?: number
  limit?: number
}

export interface PortalScraper {
  portal: string
  search(opts: PortalSearchOpts): Promise<ScrapedJob[]>
}
