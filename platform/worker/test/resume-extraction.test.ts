import { describe, expect, it } from "vitest"
import { normalizeExtractedProfile } from "../src/lib/profile/resumeExtraction.js"

describe("normalizeExtractedProfile", () => {
  it("carries through a well-formed extraction", () => {
    const profile = normalizeExtractedProfile({
      name: "Jane Doe",
      city: "Toronto",
      country: "Canada",
      commuteConstraints: null,
      cvLanguage: "English",
      employmentStatus: "Employed",
      linkedinHeadline: "Software Engineer",
      languages: [{ language: "English", level: "Native" }],
      education: [{ degree: "BSc", field: "Computer Science", institution: "U of T" }],
      experience: [{ title: "Engineer", company: "Acme", bullets: ["Shipped things"] }],
      skills: { primary: ["TypeScript"], secondary: [], domain: [], software: [] },
      certifications: ["AWS"],
      publications: [],
      awards: [],
      behavioral: { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" },
      motivation: { energizingTasks: [], drainingTasks: [] },
      targetSectors: [],
      dealbreakers: [],
      eligibility: { citizenshipOrPr: null, visaConstraintsNote: null },
    })
    expect(profile.name).toBe("Jane Doe")
    expect(profile.experience[0].bullets).toEqual(["Shipped things"])
    expect(profile.certifications).toEqual(["AWS"])
  })

  it("fills in safe defaults for a malformed or empty response instead of throwing", () => {
    const profile = normalizeExtractedProfile({})
    expect(profile.name).toBeNull()
    expect(profile.languages).toEqual([])
    expect(profile.skills).toEqual({ primary: [], secondary: [], domain: [], software: [] })
    expect(profile.behavioral.strengths).toBe("")
    expect(profile.eligibility).toEqual({ citizenshipOrPr: null, visaConstraintsNote: null })
  })

  it("drops non-string entries from string arrays instead of crashing", () => {
    const profile = normalizeExtractedProfile({
      certifications: ["Real cert", 42, null, { nested: true }],
    })
    expect(profile.certifications).toEqual(["Real cert"])
  })

  it("tolerates a completely non-object input", () => {
    const profile = normalizeExtractedProfile(null)
    expect(profile.experience).toEqual([])
    expect(profile.targetSectors).toEqual([])
  })
})
