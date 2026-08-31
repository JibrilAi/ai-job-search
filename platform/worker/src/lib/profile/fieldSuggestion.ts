import type { Env } from "../../types.js"
import type { ProfileInput } from "../db/repositories/profiles.js"
import { callGemini } from "../geminiClient.js"

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
- ${isList ? "Respond with a JSON array of short strings." : "Respond with a single JSON string."}`

  const userMessage = `Field to suggest: ${input.fieldLabel}
Current value: ${JSON.stringify(input.currentValue)}

Candidate profile so far:
${JSON.stringify(input.profile, null, 2)}`

  const responseSchema = isList ? { type: "ARRAY", items: { type: "STRING" } } : { type: "STRING" }

  const result = await callGemini(env, {
    systemPrompt,
    userMessage,
    responseSchema,
    maxOutputTokens: 512,
  })

  if (isList) return Array.isArray(result) ? result.filter((v): v is string => typeof v === "string") : []
  return typeof result === "string" ? result : ""
}
