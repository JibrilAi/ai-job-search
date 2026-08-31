import type { Env } from "../types.js"

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
const DEFAULT_MODEL = "gemini-3.6-flash"

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
  const response = await fetch(`${GEMINI_API_URL}/${DEFAULT_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: args.userMessage }] }],
      systemInstruction: { parts: [{ text: args.systemPrompt }] },
      generationConfig: {
        maxOutputTokens: args.maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: args.responseSchema,
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Gemini API request failed: ${response.status} ${body}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error("Gemini did not return a response")

  return JSON.parse(text)
}
