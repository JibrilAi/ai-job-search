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
})
