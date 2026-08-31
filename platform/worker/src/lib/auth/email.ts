import type { Env } from "../../types.js"

// Transactional email via Resend's REST API (fetch-based, no SDK dependency --
// works unmodified in the Workers runtime). RESEND_API_KEY is an optional
// secret: without it, emails are logged instead of sent, so local
// development and early testing don't hard-require a Resend account.
//
// RESEND_FROM_EMAIL must be on a domain verified in the Resend account that
// owns RESEND_API_KEY (Resend rejects sends from unverified domains) --
// set it as a [vars] entry in wrangler.toml once a domain is verified in
// Resend. Falls back to Resend's shared sandbox sender, which Resend
// restricts to only the account's own address -- any send to a real user
// from that sender returns a 403 "You can only send testing emails to your
// own email address" and never reaches its recipient.
const DEFAULT_FROM_ADDRESS = "AI Job Search <onboarding@resend.dev>"

async function sendEmail(env: Env, opts: { to: string; subject: string; html: string; devLogLabel: string }): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev email] ${opts.devLogLabel} for ${opts.to}`)
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`failed to send ${opts.devLogLabel} email: ${response.status} ${body}`)
  }
}

export async function sendMagicLinkEmail(env: Env, to: string, url: string): Promise<void> {
  await sendEmail(env, {
    to,
    subject: "Sign in to AI Job Search",
    html: `<p>Click below to sign in. This link expires in 15 minutes.</p><p><a href="${url}">${url}</a></p>`,
    devLogLabel: `magic link (${url})`,
  })
}

// Best-effort: called after account creation. Callers should not let a
// failure here fail the signup itself (see routes/auth.ts's use of
// c.executionCtx.waitUntil).
export async function sendWelcomeEmail(env: Env, to: string): Promise<void> {
  const appUrl = env.APP_ORIGIN.replace(/\/+$/, "")
  await sendEmail(env, {
    to,
    subject: "Welcome to AI Job Search",
    html: `
      <p>Welcome aboard!</p>
      <p>Your account is ready. Next step: fill in your profile so we can start ranking jobs against your skills, experience, and behavioral fit.</p>
      <p><a href="${appUrl}/profile">Set up your profile</a></p>
      <p>Once it's saved, tailored CVs and cover letters, and a ranked job feed, are one click away.</p>
    `,
    devLogLabel: "welcome email",
  })
}
