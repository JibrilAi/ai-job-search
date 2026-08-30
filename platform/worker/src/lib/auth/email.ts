import type { Env } from "../../types.js"

// Transactional email via Resend's REST API (fetch-based, no SDK dependency --
// works unmodified in the Workers runtime). RESEND_API_KEY is an optional
// secret: without it, magic-link/reset emails are logged instead of sent, so
// local development and early testing don't hard-require a Resend account.
//
// RESEND_FROM_EMAIL must be on a domain verified in the Resend account that
// owns RESEND_API_KEY (Resend rejects sends from unverified domains) --
// set it as a [vars] entry in wrangler.toml once a domain is verified in
// Resend. Falls back to Resend's shared sandbox sender, which only delivers
// to the Resend account's own verified email (fine for a first smoke test,
// not for real users).
const DEFAULT_FROM_ADDRESS = "AI Job Search <onboarding@resend.dev>"

export async function sendMagicLinkEmail(env: Env, to: string, url: string): Promise<void> {
  const subject = "Sign in to AI Job Search"
  const html = `<p>Click below to sign in. This link expires in 15 minutes.</p><p><a href="${url}">${url}</a></p>`

  if (!env.RESEND_API_KEY) {
    console.log(`[dev email] magic link for ${to}: ${url}`)
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_ADDRESS, to: [to], subject, html }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`failed to send magic-link email: ${response.status} ${body}`)
  }
}
