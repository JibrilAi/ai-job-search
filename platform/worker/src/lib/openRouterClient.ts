import type { Env } from "../types.js"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
// A router over OpenRouter's free-model pool rather than one hardcoded free
// model -- it picks a currently-live model that supports the request's
// features (structured outputs included) instead of us tracking which
// specific free model is still around, which is exactly the trap that bit
// the Gemini integration (a hardcoded model got deprecated mid-project).
const OPENROUTER_MODEL = "openrouter/free"

// Same reasoning as callGemini's retry: 429 (rate limit) and 503
// (transient overload) are worth a couple of retries, anything else
// (400/401/403/404) won't fix itself. Without this, a single rate-limited
// request used to throw immediately and push 100% of traffic onto Gemini
// for the rest of the session the moment OpenRouter's free pool got busy.
const RETRYABLE_STATUSES = new Set([429, 503])
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// OpenRouter forwards a standard Retry-After header (seconds) on 429s from
// some upstream providers -- honor it when present instead of guessing.
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
}

type JsonSchema = {
  type: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  enum?: string[]
  nullable?: boolean
}

// Every call site defines its schema once, Gemini-shaped (uppercase
// OpenAPI-style types, `nullable: true`) for callGemini -- convert that
// same schema into the OpenAI-style JSON Schema OpenRouter's
// response_format.json_schema expects, instead of maintaining two parallel
// schema definitions per call site.
function toJsonSchema(schema: JsonSchema): Record<string, unknown> {
  const type = schema.type.toLowerCase()

  if (type === "object") {
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      properties[key] = toJsonSchema(value)
    }
    return { type: "object", properties, required: Object.keys(properties), additionalProperties: false }
  }

  if (type === "array") {
    return { type: "array", items: toJsonSchema(schema.items as JsonSchema) }
  }

  const converted: Record<string, unknown> = { type: schema.nullable ? [type, "null"] : type }
  if (schema.enum) converted.enum = schema.enum
  return converted
}

/**
 * Every call site's schema is OBJECT-shaped at the top level -- OpenAI/
 * OpenRouter-style structured output requires an object at the JSON Schema
 * root anyway (unlike Gemini, which also accepts a bare string/array
 * there), and an object root is also the shape free models on OpenRouter
 * most reliably honor: enforcement varies by provider on that pool, and a
 * bare top-level scalar/array schema was observed being silently ignored
 * by some of them (they returned the raw value unwrapped instead).
 */
export async function callOpenRouter(
  env: Env,
  args: { systemPrompt: string; userMessage: string; responseSchema: object; maxOutputTokens: number },
): Promise<unknown> {
  const responseSchema = args.responseSchema as JsonSchema
  if (responseSchema.type !== "OBJECT") {
    throw new Error(
      `callOpenRouter requires an OBJECT-shaped top-level schema (got "${responseSchema.type}") -- some free models on OpenRouter don't reliably honor a bare scalar/array root, wrap it in an object property instead`,
    )
  }

  const requestBody = JSON.stringify({
    model: OPENROUTER_MODEL,
    max_tokens: args.maxOutputTokens,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema: toJsonSchema(responseSchema) },
    },
  })

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: requestBody,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
        await sleep(parseRetryAfterMs(response.headers.get("retry-after")) ?? RETRY_BASE_DELAY_MS * 2 ** attempt)
        continue
      }
      throw new Error(`OpenRouter API request failed: ${response.status} ${body}`)
    }

    const data = (await response.json()) as { model?: string; choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error("OpenRouter did not return a response")

    // A model can answer with prose or a ```json fenced block despite
    // strict structured-output being requested -- strip fencing before
    // parsing, and surface the model name + raw text on failure so a bad
    // response is diagnosable from logs instead of a bare SyntaxError.
    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")
    try {
      const parsed = JSON.parse(jsonText) as unknown
      // Cheap, always-on diagnostic: which free model actually answered.
      // Free-model routing means this varies call to call, and knowing
      // which model produced a given (possibly malformed) result is the
      // difference between guessing at a fix and actually finding one.
      console.log(`OpenRouter (${data.model ?? "unknown model"}) responded: ${jsonText.slice(0, 500)}`)
      return parsed
    } catch {
      throw new Error(`OpenRouter (${data.model ?? "unknown model"}) returned unparseable JSON: ${text.slice(0, 500)}`)
    }
  }
}
