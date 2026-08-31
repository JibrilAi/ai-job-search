import type { Env } from "../../types.js"
import { callGemini } from "../geminiClient.js"
import { RANKING_SYSTEM_PROMPT, buildRankingUserMessage, type RankingInput } from "./prompt.js"
import { validateRankingResponse, type RawRankingResponse } from "./schema.js"

const RANKING_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    scores: {
      type: "OBJECT",
      properties: {
        technical: { type: "NUMBER" },
        experience: { type: "NUMBER" },
        behavioral: { type: "NUMBER" },
        career: { type: "NUMBER" },
      },
      required: ["technical", "experience", "behavioral", "career"],
    },
    location_verdict: { type: "STRING", enum: ["PASS", "FAIL", "FLAG"] },
    language_gate: { type: "STRING", enum: ["PASS", "FAIL", "FLAG"] },
    language_note: { type: "STRING", nullable: true },
    eligibility_verdict: { type: "STRING", enum: ["PASS", "FAIL", "unverified"] },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    gaps: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["scores", "location_verdict", "language_gate", "eligibility_verdict", "strengths", "gaps"],
}

/**
 * Calls the Gemini API with forced structured JSON output so the response
 * never needs free-text parsing. Fans out once per (user, job) via
 * queue-consumers/rankConsumer.ts -- the highest-volume of this app's four
 * LLM call sites.
 */
export async function rankJob(env: Env, input: RankingInput): Promise<RawRankingResponse> {
  const result = await callGemini(env, {
    systemPrompt: RANKING_SYSTEM_PROMPT,
    userMessage: buildRankingUserMessage(input),
    responseSchema: RANKING_RESPONSE_SCHEMA,
    maxOutputTokens: 1024,
  })

  return validateRankingResponse(result)
}
