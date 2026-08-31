import type { Env } from "../types.js"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
// A router over OpenRouter's free-model pool rather than one hardcoded free
// model -- it picks a currently-live model that supports the request's
// features (structured outputs included) instead of us tracking which
// specific free model is still around, which is exactly the trap that bit
// the Gemini integration (a hardcoded model got deprecated mid-project).
const OPENROUTER_MODEL = "openrouter/free"

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
 * OpenRouter/OpenAI-style structured output requires an object at the JSON
 * Schema root (unlike Gemini, which accepts a bare string/array there) --
 * wrap a non-object top-level schema in {value: ...} for the request and
 * unwrap it back out of the parsed response, so callers see the same
 * return shape as callGemini either way.
 */
export async function callOpenRouter(
  env: Env,
  args: { systemPrompt: string; userMessage: string; responseSchema: object; maxOutputTokens: number },
): Promise<unknown> {
  const responseSchema = args.responseSchema as JsonSchema
  const isWrapped = responseSchema.type !== "OBJECT"
  const schemaForRequest: JsonSchema = isWrapped
    ? { type: "OBJECT", properties: { value: responseSchema } }
    : responseSchema

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: args.maxOutputTokens,
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "response", strict: true, schema: toJsonSchema(schemaForRequest) },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`OpenRouter API request failed: ${response.status} ${body}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error("OpenRouter did not return a response")

  const parsed = JSON.parse(text) as unknown
  return isWrapped ? (parsed as { value: unknown }).value : parsed
}
