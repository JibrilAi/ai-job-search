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
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
        continue
      }
      throw new Error(`Gemini API request failed: ${response.status} ${body}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error("Gemini did not return a response")

    return JSON.parse(text)
  }
}
