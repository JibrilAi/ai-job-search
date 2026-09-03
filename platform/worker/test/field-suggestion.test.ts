import { describe, expect, it, vi, afterEach } from "vitest"
import { suggestFieldValue } from "../src/lib/profile/fieldSuggestion.js"
import type { Env } from "../src/types.js"
import type { ProfileInput } from "../src/lib/db/repositories/profiles.js"

const emptyProfile: ProfileInput = {
  name: "Jane Doe",
  city: null,
  country: null,
  commuteConstraints: null,
  cvLanguage: null,
  employmentStatus: null,
  linkedinHeadline: null,
  noticePeriod: null,
  salaryExpectation: null,
  relocationWillingness: null,
  workArrangementPreference: null,
  portfolioUrl: null,
  languages: [],
  education: [],
  experience: [],
  skills: { primary: ["Python"], secondary: [], domain: [], software: [] },
  certifications: [],
  publications: [],
  awards: [],
  behavioral: { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" },
  motivation: { energizingTasks: [], drainingTasks: [] },
  targetSectors: [],
  dealbreakers: [],
  eligibility: { citizenshipOrPr: null, visaConstraintsNote: null },
  autoApplyEnabled: false,
  autoSubmitMode: "off",
}

const env = { OPENROUTER_API_KEY: "or-key", GEMINI_API_KEY: "test-key" } as Env

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("suggestFieldValue", () => {
  it("requests a wrapped STRING schema for a single-value field and returns the string", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
      const body = JSON.parse(init.body as string)
      expect(body.response_format.json_schema.schema).toEqual({
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      })
      expect(body.messages[1].content).toContain("LinkedIn headline")
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: "Data Engineer | Python" }) } }] }), {
        status: 200,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const value = await suggestFieldValue(env, {
      fieldLabel: "LinkedIn headline",
      fieldType: "string",
      currentValue: "",
      profile: emptyProfile,
    })

    expect(value).toBe("Data Engineer | Python")
  })

  it("requests a wrapped ARRAY-of-STRING schema for a list field and returns the array", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      expect(body.response_format.json_schema.schema).toEqual({
        type: "object",
        properties: { value: { type: "array", items: { type: "string" } } },
        required: ["value"],
        additionalProperties: false,
      })
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: ["Fintech", "Climate tech"] }) } }] }), {
        status: 200,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const value = await suggestFieldValue(env, {
      fieldLabel: "Target sectors",
      fieldType: "string[]",
      currentValue: [],
      profile: emptyProfile,
    })

    expect(value).toEqual(["Fintech", "Climate tech"])
  })

  it("filters out non-string entries from a list response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: ["ok", 5, null] }) } }] }), { status: 200 })),
    )
    const value = await suggestFieldValue(env, {
      fieldLabel: "Certifications",
      fieldType: "string[]",
      currentValue: [],
      profile: emptyProfile,
    })
    expect(value).toEqual(["ok"])
  })

  it("returns the bare string when the model ignores the {value} wrapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify("Data Engineer | Python") } }] }), { status: 200 })),
    )
    const value = await suggestFieldValue(env, {
      fieldLabel: "LinkedIn headline",
      fieldType: "string",
      currentValue: "",
      profile: emptyProfile,
    })
    expect(value).toBe("Data Engineer | Python")
  })

  it("returns the bare array when the model ignores the {value} wrapper for a list field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(["Fintech", "Climate tech"]) } }] }), { status: 200 })),
    )
    const value = await suggestFieldValue(env, {
      fieldLabel: "Target sectors",
      fieldType: "string[]",
      currentValue: [],
      profile: emptyProfile,
    })
    expect(value).toEqual(["Fintech", "Climate tech"])
  })

  it("logs a diagnostic warning naming the field when the model's value is empty", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: "" }) } }] }), { status: 200 })),
    )
    const value = await suggestFieldValue(env, {
      fieldLabel: "Employment status",
      fieldType: "string",
      currentValue: "",
      profile: emptyProfile,
    })
    expect(value).toBe("")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Employment status"))
    warnSpy.mockRestore()
  })

  it("falls back to Gemini when OpenRouter fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openrouter.ai")) return new Response("rate limited", { status: 429 })
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ value: "Backup Engineer" }) }] } }] }),
        { status: 200 },
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const value = await suggestFieldValue(env, {
      fieldLabel: "LinkedIn headline",
      fieldType: "string",
      currentValue: "",
      profile: emptyProfile,
    })

    expect(value).toBe("Backup Engineer")
  })
})
