import type { Env } from "../../types.js"

const TOKEN_TTL_SECONDS = 15 * 60 // 15 minutes

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Issues a single-use magic-link token for `email`, stored in KV with a native TTL. */
export async function issueMagicLinkToken(env: Env, email: string): Promise<string> {
  const token = randomToken()
  await env.AUTH_KV.put(`magic-link:${token}`, JSON.stringify({ email }), {
    expirationTtl: TOKEN_TTL_SECONDS,
  })
  return token
}

/** Consumes (single-use) a magic-link token, returning the email it was issued for, or null if invalid/expired. */
export async function consumeMagicLinkToken(env: Env, token: string): Promise<string | null> {
  const key = `magic-link:${token}`
  const raw = await env.AUTH_KV.get(key)
  if (!raw) return null
  await env.AUTH_KV.delete(key)
  try {
    const parsed = JSON.parse(raw) as { email: string }
    return parsed.email
  } catch {
    return null
  }
}

export function magicLinkUrl(frontendOrigin: string, token: string): string {
  return `${frontendOrigin.replace(/\/+$/, "")}/auth/verify?token=${encodeURIComponent(token)}`
}
