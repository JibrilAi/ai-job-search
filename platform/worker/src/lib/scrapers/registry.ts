import type { PortalScraper } from "./types.js"
import { createFreehireScraper } from "./freehire.js"
import { createLinkedinScraper } from "./linkedin.js"

// freehire and linkedin are wired up. The original repo's four Danish portals
// (jobbank/jobdanmark/jobindex/jobnet -- jobbank.dk, not Canada's Job Bank)
// are deliberately not ported here: they're Danish-market sources and this
// deployment's default scrape_queries seed targets Canada, so they'd add
// scraping surface without returning relevant results for this deployment.
// Port them the same way if a future user needs the Danish market.
const scrapers: Record<string, () => PortalScraper> = {
  freehire: () => createFreehireScraper(),
  linkedin: () => createLinkedinScraper(),
}

export function getScraper(portal: string): PortalScraper | null {
  const factory = scrapers[portal]
  return factory ? factory() : null
}
