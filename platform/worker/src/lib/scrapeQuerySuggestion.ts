import type { Profile } from "./db/repositories/profiles.js"

const MAX_TERMS = 8

/**
 * Derives a starting search query from a profile's own skills/domain/target
 * sectors -- the shared scrape_queries pool is otherwise built from a
 * handful of broad, untargeted admin defaults (e.g. freehire's empty-string
 * query), which skew toward whatever those portals happen to surface by
 * default rather than any individual user's field. This is only a
 * suggestion: the frontend shows it as an editable field before saving.
 */
export function suggestScrapeQuery(profile: Pick<Profile, "skills" | "targetSectors" | "city" | "country">): {
  query: string
  location: string | null
} {
  const terms: string[] = []
  const seen = new Set<string>()
  for (const term of [...profile.skills.primary, ...profile.skills.domain, ...profile.targetSectors]) {
    const key = term.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    terms.push(term.trim())
    if (terms.length >= MAX_TERMS) break
  }

  const location = profile.city && profile.country ? `${profile.city}, ${profile.country}` : profile.city || profile.country || null

  return { query: terms.join(", "), location }
}
