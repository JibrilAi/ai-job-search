import { describe, expect, it, vi, afterEach } from "vitest"
import { callGemini } from "../src/lib/geminiClient.js"
import type { Env } from "../src/types.js"

const SCHEMA = {
  type: "OBJECT",
  properties: { technical: { type: "NUMBER" } },
  required: ["technical"],
}

function callTestGemini(env: Env) {
  return callGemini(env, {
    systemPrompt: "You are a test.",
    userMessage: "Score this candidate.",
    responseSchema: SCHEMA,
    maxOutputTokens: 1024,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("callGemini", () => {
  it("sends a structured-output request with thinking minimized and parses the JSON response", async () => {
    const mockResponseBody = { candidates: [{ content: { parts: [{ text: JSON.stringify({ technical: 80 }) }] } }] }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=test-key")
      const body = JSON.parse(init.body as string)
      expect(body.generationConfig.responseMimeType).toBe("application/json")
      expect(body.generationConfig.responseSchema.required).toContain("technical")
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" })
      expect(body.contents[0].parts[0].text).toContain("Score this candidate")
      return new Response(JSON.stringify(mockResponseBody), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callTestGemini({ GEMINI_API_KEY: "test-key" } as Env)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result).toEqual({ technical: 80 })
  })

  it("throws when Gemini does not return a response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })))
    await expect(callTestGemini({ GEMINI_API_KEY: "test-key" } as Env)).rejects.toThrow(/did not return a response/)
  })

  it("surfaces finishReason when the response is truncated mid-JSON", async () => {
    const mockResponseBody = { candidates: [{ content: { parts: [{ text: '{"technical": 8' }] }, finishReason: "MAX_TOKENS" }] }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(mockResponseBody), { status: 200 })))
    await expect(callTestGemini({ GEMINI_API_KEY: "test-key" } as Env)).rejects.toThrow(/MAX_TOKENS/)
  })

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })))
    await expect(callTestGemini({ GEMINI_API_KEY: "bad-key" } as Env)).rejects.toThrow(/401/)
  })

  it("does not retry a non-retryable status", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(callTestGemini({ GEMINI_API_KEY: "bad-key" } as Env)).rejects.toThrow(/401/)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("retries a 503 and succeeds once Gemini recovers", async () => {
    const mockResponseBody = { candidates: [{ content: { parts: [{ text: JSON.stringify({ technical: 50 }) }] } }] }
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls < 3) return new Response("overloaded", { status: 503 })
      return new Response(JSON.stringify(mockResponseBody), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callTestGemini({ GEMINI_API_KEY: "test-key" } as Env)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ technical: 50 })
  })

  it("honors Google's RetryInfo.retryDelay on a 429 instead of the fixed backoff", async () => {
    const mockResponseBody = { candidates: [{ content: { parts: [{ text: JSON.stringify({ technical: 60 }) }] } }] }
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

    const start = Date.now()
    const result = await callTestGemini({ GEMINI_API_KEY: "test-key" } as Env)
    const elapsed = Date.now() - start

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ technical: 60 })
    // Honoring the parsed 50ms delay, not the fixed 500ms first-attempt backoff.
    expect(elapsed).toBeLessThan(400)
  })

  it("gives up after exhausting retries on a persistent 503", async () => {
    const fetchMock = vi.fn(async () => new Response("overloaded", { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(callTestGemini({ GEMINI_API_KEY: "test-key" } as Env)).rejects.toThrow(/503/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
