import type { Env } from "../../types.js"
import type { ProfileInput } from "../db/repositories/profiles.js"
import { callLLM } from "../llmClient.js"

export type FieldType = "string" | "string[]"

/**
 * One generic "suggest a value for this field" call, reused by every
 * AI-suggest button in the profile form instead of a per-field endpoint --
 * the request just names which field and hands over the rest of the
 * (possibly unsaved, client-side) profile as grounding context.
 */
export async function suggestFieldValue(
  env: Env,
  input: { fieldLabel: string; fieldType: FieldType; currentValue: string | string[]; profile: ProfileInput },
): Promise<string | string[]> {
  const isList = input.fieldType === "string[]"

  const systemPrompt = `You help fill in one field of a job-search candidate profile, for a job-search platform. Given the candidate's existing profile data (which may be partial or empty), suggest a good value for the requested field.
- Only use information already present in the given profile -- never invent employers, dates, skills, achievements, or other facts not implied by the data.
- If the profile doesn't contain enough information to confidently suggest a value for this field, return the current value unchanged (or an empty ${isList ? "array" : "string"} if it is currently empty) rather than guessing.
- Respond with a JSON object: {"value": ${isList ? "[...]" : '"..."'}}.`

  const userMessage = `Field to suggest: ${input.fieldLabel}
Current value: ${JSON.stringify(input.currentValue)}

Candidate profile so far:
${JSON.stringify(input.profile, null, 2)}`

  // OBJECT-shaped at the top level (not a bare STRING/ARRAY) for every
  // provider, not just the ones that need it -- OpenRouter's free-model
  // pool has uneven structured-output enforcement ("enforcement varies by
  // provider: some guarantee schema-conforming output, others treat your
  // schema as a strong hint"), and a {"value": ...} object is a far more
  // commonly and reliably honored shape than a bare top-level scalar/array,
  // which some free models were ignoring in favor of returning the raw
  // value unwrapped.
  const responseSchema = {
    type: "OBJECT",
    properties: { value: isList ? { type: "ARRAY", items: { type: "STRING" } } : { type: "STRING" } },
    required: ["value"],
  }

  const result = await callLLM(env, {
    systemPrompt,
    userMessage,
    responseSchema,
    maxOutputTokens: 1024,
  })

  // We always ask for {"value": ...}, but OpenRouter's free-model pool
  // enforces response_format unevenly -- a model can ignore the wrapper
  // and answer with the bare value instead (a string/array directly,
  // rather than {value: ...}). Unwrap when the wrapper is honored, but
  // fall back to treating the raw result as the value itself rather than
  // silently defaulting to empty when it isn't.
  const value =
    result && typeof result === "object" && !Array.isArray(result) && "value" in result
      ? (result as { value: unknown }).value
      : result

  if (isList) {
    const list = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
    if (list.length === 0) {
      console.warn(`suggestFieldValue("${input.fieldLabel}") -- empty result, raw provider value: ${JSON.stringify(value)}`)
    }
    return list
  }

  const str = typeof value === "string" ? value : ""
  if (str === "") {
    console.warn(`suggestFieldValue("${input.fieldLabel}") -- empty result, raw provider value: ${JSON.stringify(value)}`)
  }
  return str
}
