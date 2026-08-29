import type { PortalScraper } from "./types.js"
import { createFreehireScraper } from "./freehire.js"

// Only freehire is wired up for MVP (Phase 2) -- the lowest-risk portal.
// Danish portals (jobbank/jobdanmark/jobindex/jobnet) and LinkedIn are ported
// the same way (see the plan's Scraper migration approach) but deferred; add
// their entries here once ported, keyed by the `portal` value scrape_queries
// rows use.
const scrapers: Record<string, () => PortalScraper> = {
  freehire: () => createFreehireScraper(),
}

export function getScraper(portal: string): PortalScraper | null {
  const factory = scrapers[portal]
  return factory ? factory() : null
}
