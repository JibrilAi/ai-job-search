import type { Env } from "../../types.js"
import { RANKING_SYSTEM_PROMPT, buildRankingUserMessage, type RankingInput } from "./prompt.js"
import { validateRankingResponse, type RawRankingResponse } from "./schema.js"

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_MODEL = "claude-sonnet-5"

const SUBMIT_RANKING_TOOL = {
  name: "submit_ranking",
  description: "Submit the structured job-fit evaluation.",
  input_schema: {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: {
          technical: { type: "number" },
          experience: { type: "number" },
          behavioral: { type: "number" },
          career: { type: "number" },
        },
        required: ["technical", "experience", "behavioral", "career"],
      },
      location_verdict: { type: "string", enum: ["PASS", "FAIL", "FLAG"] },
      language_gate: { type: "string", enum: ["PASS", "FAIL", "FLAG"] },
      language_note: { type: ["string", "null"] },
      eligibility_verdict: { type: "string", enum: ["PASS", "FAIL", "unverified"] },
      strengths: { type: "array", items: { type: "string" } },
      gaps: { type: "array", items: { type: "string" } },
    },
    required: ["scores", "location_verdict", "language_gate", "eligibility_verdict", "strengths", "gaps"],
  },
}

/**
 * Calls the Anthropic Messages API directly (per the plan's decision #3),
 * forcing structured output via tool-use so the response never needs
 * free-text JSON parsing. The system prompt carries a cache_control
 * breakpoint since it is byte-identical across every call in this fan-out.
 */
export async function rankJobWithClaude(env: Env, input: RankingInput): Promise<RawRankingResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: RANKING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildRankingUserMessage(input) }],
      tools: [SUBMIT_RANKING_TOOL],
      tool_choice: { type: "tool", name: "submit_ranking" },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Anthropic API request failed: ${response.status} ${body}`)
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; name?: string; input?: unknown }>
  }
  const toolUse = data.content.find((block) => block.type === "tool_use" && block.name === "submit_ranking")
  if (!toolUse) throw new Error("Claude did not return a submit_ranking tool call")

  return validateRankingResponse(toolUse.input)
}
