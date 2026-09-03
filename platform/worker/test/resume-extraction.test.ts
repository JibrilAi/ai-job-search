import { describe, expect, it, vi, afterEach } from "vitest"
import { normalizeExtractedProfile, extractProfileFromResumeText } from "../src/lib/profile/resumeExtraction.js"
import type { Env } from "../src/types.js"

const env = { OPENROUTER_API_KEY: "or-key", GEMINI_API_KEY: "gem-key" } as Env

const EMPTY_EXTRACTION = {
  name: null,
  city: null,
  country: null,
  commuteConstraints: null,
  cvLanguage: null,
  employmentStatus: null,
  linkedinHeadline: null,
  languages: [],
  education: [],
  experience: [],
  skills: { primary: [], secondary: [], domain: [], software: [] },
  certifications: [],
  publications: [],
  awards: [],
  behavioral: { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" },
  motivation: { energizingTasks: [], drainingTasks: [] },
  targetSectors: [],
  dealbreakers: [],
  eligibility: { citizenshipOrPr: null, visaConstraintsNote: null },
}

const REAL_EXTRACTION = {
  ...EMPTY_EXTRACTION,
  name: "Jane Doe",
  experience: [{ title: "Engineer", company: "Acme", bullets: ["Shipped things"] }],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it("carries through the application-screener fields when present", () => {
    const profile = normalizeExtractedProfile({
      noticePeriod: "2 weeks",
      salaryExpectation: "$120,000-$140,000 CAD",
      relocationWillingness: "Open to relocating within Canada",
      workArrangementPreference: "Remote preferred",
      portfolioUrl: "https://github.com/janedoe",
    })
    expect(profile.noticePeriod).toBe("2 weeks")
    expect(profile.salaryExpectation).toBe("$120,000-$140,000 CAD")
    expect(profile.relocationWillingness).toBe("Open to relocating within Canada")
    expect(profile.workArrangementPreference).toBe("Remote preferred")
    expect(profile.portfolioUrl).toBe("https://github.com/janedoe")
  })

  it("fills in safe defaults for a malformed or empty response instead of throwing", () => {
    const profile = normalizeExtractedProfile({})
    expect(profile.name).toBeNull()
    expect(profile.languages).toEqual([])
    expect(profile.skills).toEqual({ primary: [], secondary: [], domain: [], software: [] })
    expect(profile.behavioral.strengths).toBe("")
    expect(profile.eligibility).toEqual({ citizenshipOrPr: null, visaConstraintsNote: null })
    expect(profile.noticePeriod).toBeNull()
    expect(profile.salaryExpectation).toBeNull()
    expect(profile.relocationWillingness).toBeNull()
    expect(profile.workArrangementPreference).toBeNull()
    expect(profile.portfolioUrl).toBeNull()
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

  it("drops malformed (non-object) experience/education/language entries instead of turning them into blank rows", () => {
    const profile = normalizeExtractedProfile({
      experience: ["just a string", 42, null, { title: "Engineer", company: "Acme", bullets: ["did stuff"] }],
      education: ["also a string", { degree: "BSc", field: "CS", institution: "U of T" }],
      languages: [null, { language: "English", level: "Native" }],
    })
    expect(profile.experience).toEqual([{ title: "Engineer", startDate: undefined, endDate: undefined, company: "Acme", location: undefined, bullets: ["did stuff"] }])
    expect(profile.education).toHaveLength(1)
    expect(profile.education[0].degree).toBe("BSc")
    expect(profile.languages).toEqual([{ language: "English", level: "Native" }])
  })

  it("drops an experience entry with neither title nor company, even if bullets picked up stray text", () => {
    const profile = normalizeExtractedProfile({
      experience: [{ title: "", company: "", bullets: ["orphaned bullet"] }],
    })
    expect(profile.experience).toEqual([])
  })

  it("wraps a bare-string bullets value into a one-element array instead of losing it", () => {
    const profile = normalizeExtractedProfile({
      experience: [{ title: "Engineer", company: "Acme", bullets: "Single bullet as a string" }],
    })
    expect(profile.experience[0].bullets).toEqual(["Single bullet as a string"])
  })
})

describe("extractProfileFromResumeText", () => {
  it("returns the primary provider's result when it found real data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(REAL_EXTRACTION) } }] }), { status: 200 })),
    )
    const profile = await extractProfileFromResumeText(env, "Jane Doe, Software Engineer at Acme...")
    expect(profile.name).toBe("Jane Doe")
  })

  it("retries directly against Gemini when the primary provider returns an empty profile", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(EMPTY_EXTRACTION) } }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(REAL_EXTRACTION) }] } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const profile = await extractProfileFromResumeText(env, "Jane Doe, Software Engineer at Acme...")

    expect(profile.name).toBe("Jane Doe")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws when both providers return an empty profile", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(EMPTY_EXTRACTION) } }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(EMPTY_EXTRACTION) }] } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(extractProfileFromResumeText(env, "unreadable garbage text")).rejects.toThrow(/no usable data/)
  })

  it("retries against Gemini for experience specifically when other fields succeeded but experience came back empty, keeping the primary provider's other fields", async () => {
    const primaryNoExperience = { ...REAL_EXTRACTION, experience: [] }
    const geminiExperienceOnly = {
      ...EMPTY_EXTRACTION,
      name: "Someone Else",
      experience: [{ title: "Designer", company: "Widgets Inc", bullets: ["Designed widgets"] }],
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(primaryNoExperience) } }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiExperienceOnly) }] } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const profile = await extractProfileFromResumeText(env, "Jane Doe, Software Engineer at Acme...")

    expect(profile.name).toBe("Jane Doe")
    expect(profile.experience).toEqual([{ title: "Designer", startDate: undefined, endDate: undefined, company: "Widgets Inc", location: undefined, bullets: ["Designed widgets"] }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not throw when experience stays empty on both providers, as long as other fields succeeded (a genuinely experience-free resume)", async () => {
    const noExperienceButOtherwiseReal = { ...REAL_EXTRACTION, experience: [] }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(noExperienceButOtherwiseReal) } }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(noExperienceButOtherwiseReal) }] } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const profile = await extractProfileFromResumeText(env, "Jane Doe, recent graduate, no work history yet...")

    expect(profile.name).toBe("Jane Doe")
    expect(profile.experience).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
