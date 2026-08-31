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

  it("does not retry a non-retryable status", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    const env = { GEMINI_API_KEY: "bad-key" } as Env
    await expect(
      rankJob(env, {
        job: { title: "x", company: "y", location: null, description: null },
        profile: fakeProfile,
      }),
    ).rejects.toThrow(/401/)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("retries a 503 and succeeds once Gemini recovers", async () => {
    const mockResponseBody = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  scores: { technical: 50, experience: 50, behavioral: 50, career: 50 },
                  location_verdict: "PASS",
                  language_gate: "PASS",
                  language_note: null,
                  eligibility_verdict: "PASS",
                  strengths: [],
                  gaps: [],
                }),
              },
            ],
          },
        },
      ],
    }
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls < 3) return new Response("overloaded", { status: 503 })
      return new Response(JSON.stringify(mockResponseBody), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const env = { GEMINI_API_KEY: "test-key" } as Env
    const result = await rankJob(env, {
      job: { title: "x", company: "y", location: null, description: null },
      profile: fakeProfile,
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.scores.technical).toBe(50)
  })

  it("honors Google's RetryInfo.retryDelay on a 429 instead of the fixed backoff", async () => {
    const mockResponseBody = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  scores: { technical: 60, experience: 60, behavioral: 60, career: 60 },
                  location_verdict: "PASS",
                  language_gate: "PASS",
                  language_note: null,
                  eligibility_verdict: "PASS",
                  strengths: [],
                  gaps: [],
                }),
              },
            ],
          },
        },
      ],
    }
    const rateLimitBody = JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "0.05s" }],
      },
    })
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls < 2) return new Response(rateLimitBody, { status: 429 })
      return new Response(JSON.stringify(mockResponseBody), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const env = { GEMINI_API_KEY: "test-key" } as Env
    const start = Date.now()
    const result = await rankJob(env, {
      job: { title: "x", company: "y", location: null, description: null },
      profile: fakeProfile,
    })
    const elapsed = Date.now() - start

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.scores.technical).toBe(60)
    // Honoring the parsed 50ms delay, not the fixed 500ms first-attempt backoff.
    expect(elapsed).toBeLessThan(400)
  })

  it("gives up after exhausting retries on a persistent 503", async () => {
    const fetchMock = vi.fn(async () => new Response("overloaded", { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    const env = { GEMINI_API_KEY: "test-key" } as Env
    await expect(
      rankJob(env, {
        job: { title: "x", company: "y", location: null, description: null },
        profile: fakeProfile,
      }),
    ).rejects.toThrow(/503/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
