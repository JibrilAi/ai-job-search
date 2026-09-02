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

  it("does not retry a non-retryable status", async () => {
    const fetchMock = vi.fn(async () => new Response("no credits", { status: 402 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
        systemPrompt: "sys",
        userMessage: "usr",
        responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
        maxOutputTokens: 512,
      }),
    ).rejects.toThrow(/402/)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("retries a 429 and succeeds once OpenRouter recovers", async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls < 2) return new Response("rate limited", { status: 429 })
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: "hi" }) } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
      systemPrompt: "sys",
      userMessage: "usr",
      responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
      maxOutputTokens: 512,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ value: "hi" })
  })

  it("honors a Retry-After header on a 429 instead of the fixed backoff", async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls < 2) return new Response("rate limited", { status: 429, headers: { "retry-after": "0.05" } })
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: "hi" }) } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const start = Date.now()
    const result = await callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
      systemPrompt: "sys",
      userMessage: "usr",
      responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
      maxOutputTokens: 512,
    })
    const elapsed = Date.now() - start

    expect(result).toEqual({ value: "hi" })
    // Honoring the parsed 50ms delay, not the fixed 500ms first-attempt backoff.
    expect(elapsed).toBeLessThan(400)
  })

  it("gives up after exhausting retries on a persistent 429", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
        systemPrompt: "sys",
        userMessage: "usr",
        responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
        maxOutputTokens: 512,
      }),
    ).rejects.toThrow(/429/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
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

  it("strips a markdown code fence around the JSON before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"value":"hi"}\n```' } }] }), { status: 200 })),
    )
    const result = await callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
      systemPrompt: "sys",
      userMessage: "usr",
      responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
      maxOutputTokens: 512,
    })
    expect(result).toEqual({ value: "hi" })
  })

  it("throws a diagnosable error naming the model when the content isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ model: "some/free-model", choices: [{ message: { content: "sorry, I can't help with that" } }] }), { status: 200 })),
    )
    await expect(
      callOpenRouter({ OPENROUTER_API_KEY: "test-or-key" } as Env, {
        systemPrompt: "sys",
        userMessage: "usr",
        responseSchema: { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] },
        maxOutputTokens: 512,
      }),
    ).rejects.toThrow(/some\/free-model/)
  })
})
