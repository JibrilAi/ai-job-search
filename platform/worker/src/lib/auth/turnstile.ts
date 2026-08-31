import type { Env } from "../../types.js"

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/**
 * Verifies a Cloudflare Turnstile token server-side. When TURNSTILE_SECRET_KEY
 * isn't configured (local dev without a Cloudflare Turnstile widget set up),
 * this passes through so auth still works -- mirrors the RESEND_API_KEY
 * dev fallback in lib/auth/email.ts. Set the secret in production so
 * signup/login/magic-link are actually gated.
 */
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string | undefined): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn("TURNSTILE_SECRET_KEY not set -- skipping Turnstile verification (dev only)")
    return true
  }
  if (!token) return false

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token })
  if (ip) body.set("remoteip", ip)

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body })
    const result = await res.json<{ success: boolean }>()
    return result.success === true
  } catch (err) {
    console.error("Turnstile verification request failed:", err)
    return false
  }
}
