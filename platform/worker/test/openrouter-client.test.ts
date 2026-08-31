import { describe, expect, it, vi, afterEach } from "vitest"
import { callOpenRouter } from "../src/lib/openRouterClient.js"
import type { Env } from "../src/types.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("callOpenRouter", () => {
  it("converts a Gemini-shaped OBJECT schema to JSON Schema and returns it unwrapped", async () => {
    const schema = {
      type: "OBJECT",
      properties: {
        technical: { type: "NUMBER" },
        note: { type: "STRING", nullable: true },
        tags: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["technical", "note", "tags"],
    }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
      const headers = init.headers as Record<string, string>
      expect(headers.authorization).toBe("Bearer test-or-key")
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe("openrouter/free")
      expect(body.messages).toEqual([
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ])
      const jsonSchema = body.response_format.json_schema.schema
      expect(jsonSchema).toEqual({
        type: "object",
        properties: {
          technical: { type: "number" },
          note: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["technical", "note", "tags"],
        additionalProperties: false,
      })
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ technical: 80, note: null, tags: ["a"] }) } }] }),
        { status: 200 },
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
      systemPrompt: "sys",
      userMessage: "usr",
      responseSchema: schema,
      maxOutputTokens: 512,
    })

    expect(result).toEqual({ technical: 80, note: null, tags: ["a"] })
  })

  it("throws when given a non-OBJECT top-level schema", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
        systemPrompt: "sys",
        userMessage: "usr",
        responseSchema: { type: "ARRAY", items: { type: "STRING" } },
        maxOutputTokens: 512,
      }),
    ).rejects.toThrow(/OBJECT-shaped/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no credits", { status: 402 })))
    await expect(
      callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
        systemPrompt: "sys",
        userMessage: "usr",
        responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
        maxOutputTokens: 512,
      }),
    ).rejects.toThrow(/402/)
  })

  it("throws when OpenRouter does not return a response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })))
    await expect(
      callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
        systemPrompt: "sys",
        userMessage: "usr",
        responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
        maxOutputTokens: 512,
      }),
    ).rejects.toThrow(/did not return a response/)
  })
})
