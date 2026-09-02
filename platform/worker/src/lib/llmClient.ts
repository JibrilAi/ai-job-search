import type { Env } from "../types.js"
import { callOpenRouter } from "./openRouterClient.js"
import { callGemini } from "./geminiClient.js"

/**
 * OpenRouter's free-model router is the primary provider (genuinely $0
 * per call); Gemini (paid tier) is the fallback whenever OpenRouter can't
 * produce a usable answer -- rate-limited, a flaky free model, a transient
 * error -- so a free-tier hiccup on OpenRouter's side never interrupts the
 * app instead of surfacing as a user-facing failure.
 */
export async function callLLM(
  env: Env,
  args: { systemPrompt: string; userMessage: string; responseSchema: object; maxOutputTokens: number },
): Promise<unknown> {
  try {
    return await callOpenRouter(env, args)
  } catch (err) {
    console.error("OpenRouter failed, falling back to Gemini:", err)
    return await callGemini(env, args)
  }
}

/**
 * True when the final error out of callLLM is a 429 from whichever
 * provider actually failed last -- both callOpenRouter and callGemini
 * embed the numeric HTTP status in their thrown message (see
 * "API request failed: <status> ..." in each). Route handlers use this to
 * surface a specific "try again shortly" message instead of the same
 * generic failure text for every kind of error.
 */
export function isRateLimitError(err: unknown): boolean {
  return err instanceof Error && /API request failed: 429\b/.test(err.message)
}
