import { describe, expect, it } from "vitest"
import { suggestScrapeQuery } from "../src/lib/scrapeQuerySuggestion.js"

describe("suggestScrapeQuery", () => {
  it("derives keywords from skills, domain, and target sectors", () => {
    const suggestion = suggestScrapeQuery({
      skills: { primary: ["Entrepreneurship", "Project Management"], secondary: [], domain: ["Aviation", "Finance"], software: [] },
      targetSectors: ["Real Estate"],
      city: "Toronto",
      country: "Canada",
    })
    expect(suggestion.query).toBe("Entrepreneurship, Project Management, Aviation, Finance, Real Estate")
    expect(suggestion.location).toBe("Toronto, Canada")
  })

  it("de-duplicates case-insensitively across skills/domain/sectors", () => {
    const suggestion = suggestScrapeQuery({
      skills: { primary: ["Finance"], secondary: [], domain: ["finance"], software: [] },
      targetSectors: ["FINANCE"],
      city: null,
      country: null,
    })
    expect(suggestion.query).toBe("Finance")
  })

  it("caps the number of terms", () => {
    const suggestion = suggestScrapeQuery({
      skills: { primary: ["A", "B", "C", "D", "E"], secondary: [], domain: ["F", "G", "H"], software: [] },
      targetSectors: ["I", "J"],
      city: null,
      country: null,
    })
    expect(suggestion.query.split(", ")).toHaveLength(8)
  })

  it("falls back to whichever of city/country is set, or null", () => {
    expect(suggestScrapeQuery({ skills: { primary: [], secondary: [], domain: [], software: [] }, targetSectors: [], city: "Berlin", country: null }).location).toBe(
      "Berlin",
    )
    expect(
      suggestScrapeQuery({ skills: { primary: [], secondary: [], domain: [], software: [] }, targetSectors: [], city: null, country: null }).location,
    ).toBeNull()
  })
})
