import { describe, expect, it, vi, afterEach } from "vitest"
import { callLLM } from "../src/lib/llmClient.js"
import type { Env } from "../src/types.js"

const ARGS = {
  systemPrompt: "sys",
  userMessage: "usr",
  responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
  maxOutputTokens: 128,
}
const env = { OPENROUTER_API_KEY: "or-key", GEMINI_API_KEY: "gem-key" } as Env

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("callLLM", () => {
  it("uses OpenRouter and never calls Gemini when OpenRouter succeeds", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: "hi" }) } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callLLM(env, ARGS)

    expect(result).toEqual({ value: "hi" })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("falls back to Gemini when OpenRouter fails, with no interruption to the caller", async () => {
    const calledUrls: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      calledUrls.push(url)
      if (url.includes("openrouter.ai")) return new Response("no credits", { status: 402 })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify("hi") }] } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callLLM(env, ARGS)

    expect(result).toBe("hi")
    expect(calledUrls[0]).toContain("openrouter.ai")
    expect(calledUrls[1]).toContain("generativelanguage.googleapis.com")
  })

  it("throws Gemini's error when both providers fail", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openrouter.ai")) return new Response("no credits", { status: 402 })
      return new Response("bad key", { status: 401 })
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(callLLM(env, ARGS)).rejects.toThrow(/401/)
  })
})
