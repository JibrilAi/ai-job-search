import type { Env } from "../types.js"

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
const DEFAULT_MODEL = "gemini-3.6-flash"

// 429 (rate limit) and 503 (transient overload -- Google's own "high demand,
// try again later" response) are worth a couple of retries; anything else
// (400 bad request, 401/403 auth, 404 model) won't fix itself on retry.
const RETRYABLE_STATUSES = new Set([429, 503])
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A 429 body includes a RetryInfo detail naming exactly how long Google
// wants us to wait (e.g. "6.95s") -- that's frequently several seconds,
// well past our own fixed backoff schedule, so honor it when present
// instead of retrying too early and burning the retry budget for nothing.
function parseRetryDelayMs(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { error?: { details?: Array<{ "@type"?: string; retryDelay?: string }> } }
    const retryInfo = parsed.error?.details?.find((d) => d["@type"]?.includes("RetryInfo"))
    const match = retryInfo?.retryDelay?.match(/^([\d.]+)s$/)
    return match ? Math.ceil(parseFloat(match[1]) * 1000) : null
  } catch {
    return null
  }
}

/**
 * Shared Gemini structured-output call: a system prompt + one user message,
 * with generationConfig.responseSchema forcing the entire response body to
 * be the JSON object described by responseSchema (Gemini's equivalent of
 * Claude's forced tool-use pattern this app used previously -- no tool-call
 * framing needed, the response text itself is the JSON to parse).
 */
export async function callGemini(
  env: Env,
  args: { systemPrompt: string; userMessage: string; responseSchema: object; maxOutputTokens: number },
): Promise<unknown> {
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: args.userMessage }] }],
    systemInstruction: { parts: [{ text: args.systemPrompt }] },
    generationConfig: {
      maxOutputTokens: args.maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: args.responseSchema,
      // Gemini 3.x models can't fully disable thinking (unlike 2.5's
      // thinkingBudget: 0, which conflicts with this field) -- "low" keeps
      // it minimal, since none of this app's calls need deep reasoning.
      // Thinking tokens count against maxOutputTokens, so without this a
      // response can burn the whole budget on internal reasoning and get
      // cut off mid-JSON before writing the actual answer.
      thinkingConfig: { thinkingLevel: "low" },
    },
  })

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${GEMINI_API_URL}/${DEFAULT_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
        await sleep(parseRetryDelayMs(body) ?? RETRY_BASE_DELAY_MS * 2 ** attempt)
        continue
      }
      throw new Error(`Gemini API request failed: ${response.status} ${body}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    }
    const candidate = data.candidates?.[0]
    const text = candidate?.content?.parts?.[0]?.text
    if (!text) throw new Error("Gemini did not return a response")

    try {
      return JSON.parse(text)
    } catch {
      // Most often MAX_TOKENS -- the response was cut off mid-JSON before
      // finishing, usually because thinking consumed most of the budget.
      throw new Error(`Gemini returned incomplete/invalid JSON (finishReason: ${candidate?.finishReason ?? "unknown"}): ${text}`)
    }
  }
}
