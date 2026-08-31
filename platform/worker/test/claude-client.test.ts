import { describe, expect, it, vi, afterEach } from "vitest"
import { rankJobWithClaude } from "../src/lib/ranking/claudeClient.js"
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

describe("rankJobWithClaude", () => {
  it("sends a forced tool-use request and parses the tool_use response", async () => {
    const mockResponseBody = {
      content: [
        {
          type: "tool_use",
          name: "submit_ranking",
          input: {
            scores: { technical: 80, experience: 70, behavioral: 60, career: 85 },
            location_verdict: "PASS",
            language_gate: "PASS",
            language_note: null,
            eligibility_verdict: "PASS",
            strengths: ["Strong Python background"],
            gaps: ["Limited fintech experience"],
          },
        },
      ],
    }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.anthropic.com/v1/messages")
      const body = JSON.parse(init.body as string)
      expect(body.tool_choice).toEqual({ type: "tool", name: "submit_ranking" })
      expect(body.system[0].cache_control).toEqual({ type: "ephemeral" })
      expect(body.messages[0].content).toContain("Senior Engineer")
      return new Response(JSON.stringify(mockResponseBody), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const env = { ANTHROPIC_API_KEY: "test-key" } as Env
    const result = await rankJobWithClaude(env, {
      job: { title: "Senior Engineer", company: "Acme", location: "Copenhagen", description: "Build things." },
      profile: fakeProfile,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.scores.technical).toBe(80)
    expect(result.location_verdict).toBe("PASS")
  })

  it("throws when Claude does not return a submit_ranking tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "no tool call" }] }), { status: 200 })),
    )
    const env = { ANTHROPIC_API_KEY: "test-key" } as Env
    await expect(
      rankJobWithClaude(env, {
        job: { title: "x", company: "y", location: null, description: null },
        profile: fakeProfile,
      }),
    ).rejects.toThrow(/submit_ranking/)
  })

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })))
    const env = { ANTHROPIC_API_KEY: "bad-key" } as Env
    await expect(
      rankJobWithClaude(env, {
        job: { title: "x", company: "y", location: null, description: null },
        profile: fakeProfile,
      }),
    ).rejects.toThrow(/401/)
  })
})
