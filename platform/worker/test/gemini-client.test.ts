import { describe, expect, it, vi, afterEach } from "vitest"
import { rankJob } from "../src/lib/ranking/geminiClient.js"
import type { Env } from "../src/types.js"
import type { Profile } from "../src/lib/db/repositories/profiles.js"

const fakeProfile: Profile = {
  userId: "u1",
  name: "Test Candidate",
  city: "Copenhagen",
  country: "Denmark",
  commuteConstraints: null,
  cvLanguage: "English",
  employmentStatus: null,
  linkedinHeadline: null,
  languages: [{ language: "English", level: "C1" }],
  education: [],
  experience: [{ title: "Engineer", company: "Acme", bullets: ["Built things"] }],
  skills: { primary: ["Python"], secondary: [], domain: [], software: [] },
  certifications: [],
  publications: [],
  awards: [],
  behavioral: { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" },
  motivation: { energizingTasks: [], drainingTasks: [] },
  targetSectors: [],
  dealbreakers: [],
  eligibility: { citizenshipOrPr: "Danish citizen", visaConstraintsNote: null },
  autoApplyEnabled: false,
  profileVersion: 1,
  updatedAt: new Date().toISOString(),
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("rankJob", () => {
  it("sends a structured-output request and parses the JSON response", async () => {
    const mockResponseBody = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  scores: { technical: 80, experience: 70, behavioral: 60, career: 85 },
                  location_verdict: "PASS",
                  language_gate: "PASS",
                  language_note: null,
                  eligibility_verdict: "PASS",
                  strengths: ["Strong Python background"],
                  gaps: ["Limited fintech experience"],
                }),
              },
            ],
          },
        },
      ],
    }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=test-key")
      const body = JSON.parse(init.body as string)
      expect(body.generationConfig.responseMimeType).toBe("application/json")
      expect(body.generationConfig.responseSchema.required).toContain("scores")
      expect(body.contents[0].parts[0].text).toContain("Senior Engineer")
      return new Response(JSON.stringify(mockResponseBody), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const env = { GEMINI_API_KEY: "test-key" } as Env
    const result = await rankJob(env, {
      job: { title: "Senior Engineer", company: "Acme", location: "Copenhagen", description: "Build things." },
      profile: fakeProfile,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.scores.technical).toBe(80)
    expect(result.location_verdict).toBe("PASS")
  })

  it("throws when Gemini does not return a response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })))
    const env = { GEMINI_API_KEY: "test-key" } as Env
    await expect(
      rankJob(env, {
        job: { title: "x", company: "y", location: null, description: null },
        profile: fakeProfile,
      }),
    ).rejects.toThrow(/did not return a response/)
  })

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })))
    const env = { GEMINI_API_KEY: "bad-key" } as Env
    await expect(
      rankJob(env, {
        job: { title: "x", company: "y", location: null, description: null },
        profile: fakeProfile,
      }),
    ).rejects.toThrow(/401/)
  })
})
