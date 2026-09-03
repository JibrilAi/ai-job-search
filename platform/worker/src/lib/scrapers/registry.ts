import type { PortalScraper } from "./types.js"
import { createFreehireScraper } from "./freehire.js"
import { createLinkedinScraper } from "./linkedin.js"
import { createGreenhouseScraper } from "./greenhouse.js"
import { createLeverScraper } from "./lever.js"

// freehire, linkedin, greenhouse, and lever are wired up. The original
// repo's four Danish portals (jobbank/jobdanmark/jobindex/jobnet --
// jobbank.dk, not Canada's Job Bank) are deliberately not ported here:
// they're Danish-market sources and this deployment's default
// scrape_queries seed targets Canada, so they'd add scraping surface
// without returning relevant results for this deployment. Port them the
// same way if a future user needs the Danish market.
const scrapers: Record<string, () => PortalScraper> = {
  freehire: () => createFreehireScraper(),
  linkedin: () => createLinkedinScraper(),
  greenhouse: () => createGreenhouseScraper(),
  lever: () => createLeverScraper(),
}

export function getScraper(portal: string): PortalScraper | null {
  const factory = scrapers[portal]
  return factory ? factory() : null
}

/**
 * Portals that accept a free-text `query` -- used to fan a user's search
 * preferences out to every keyword-searchable portal. greenhouse/lever are
 * deliberately excluded: their `query` means "which companies' boards"
 * (comma-separated board tokens/slugs), not a topic keyword, so fanning a
 * user's search term into it would be a category error -- they're
 * populated instead via admin-seeded scrape_queries rows naming actual
 * company tokens (see migrations/0011_greenhouse_lever_seed.sql).
 */
export const KEYWORD_SEARCHABLE_PORTALS = Object.keys(scrapers).filter((p) => p !== "greenhouse" && p !== "lever")
