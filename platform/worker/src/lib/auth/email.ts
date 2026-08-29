import type { Env } from "../../types.js"

// Transactional email via Resend's REST API (fetch-based, no SDK dependency --
// works unmodified in the Workers runtime). RESEND_API_KEY is an optional
// secret: without it, magic-link/reset emails are logged instead of sent, so
// local development and early testing don't hard-require a Resend account.
// A resolved default sender domain also needs to be configured before this
// goes live in production (Resend requires a verified sending domain).

const FROM_ADDRESS = "AI Job Search <noreply@ai-job-search.app>"

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
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`failed to send magic-link email: ${response.status} ${body}`)
  }
}
