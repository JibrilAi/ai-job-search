import { Hono } from "hono"
import type { Env } from "../types.js"
import { generateSalt, hashPassword, isPasswordStrongEnough, verifyPassword } from "../lib/auth/password.js"
import { clearSessionCookie, createSession, deleteSession, getSessionFromRequest, sessionCookie } from "../lib/auth/session.js"
import { consumeMagicLinkToken, issueMagicLinkToken, magicLinkUrl } from "../lib/auth/magicLink.js"
import { sendMagicLinkEmail, sendWelcomeEmail } from "../lib/auth/email.js"
import { verifyTurnstile } from "../lib/auth/turnstile.js"
import { createUser, findUserByEmail, findUserById, updatePassword } from "../lib/db/repositories/users.js"

const auth = new Hono<{ Bindings: Env }>()

function isSecure(c: { env: Env }): boolean {
  return c.env.ENVIRONMENT === "production"
}

auth.post("/signup", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; turnstileToken?: string }>().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password
  if (!email || !email.includes("@")) return c.json({ error: "a valid email is required" }, 400)
  if (!password || !isPasswordStrongEnough(password)) {
    return c.json({ error: "password must be at least 8 characters" }, 400)
  }
  const humanVerified = await verifyTurnstile(c.env, body?.turnstileToken, c.req.header("CF-Connecting-IP"))
  if (!humanVerified) return c.json({ error: "verification failed, please try again" }, 400)

  const existing = await findUserByEmail(c.env, email)
  if (existing) return c.json({ error: "an account with this email already exists" }, 409)

  const { hash, salt } = await hashPassword(password)
  const user = await createUser(c.env, { email, passwordHash: hash, passwordSalt: salt })
  const session = await createSession(c.env, user.id, {
    userAgent: c.req.header("User-Agent"),
    ip: c.req.header("CF-Connecting-IP"),
  })
  c.header("Set-Cookie", sessionCookie(session.id, isSecure(c)))
  c.executionCtx.waitUntil(sendWelcomeEmail(c.env, user.email).catch((err) => console.error("welcome email failed:", err)))
  return c.json({ user: { id: user.id, email: user.email, role: user.role } }, 201)
})

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; turnstileToken?: string }>().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password
  if (!email || !password) return c.json({ error: "email and password are required" }, 400)
  const humanVerified = await verifyTurnstile(c.env, body?.turnstileToken, c.req.header("CF-Connecting-IP"))
  if (!humanVerified) return c.json({ error: "verification failed, please try again" }, 400)

  const user = await findUserByEmail(c.env, email)
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return c.json({ error: "invalid email or password" }, 401)
  }
  const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt)
  if (!valid) return c.json({ error: "invalid email or password" }, 401)

  const session = await createSession(c.env, user.id, {
    userAgent: c.req.header("User-Agent"),
    ip: c.req.header("CF-Connecting-IP"),
  })
  c.header("Set-Cookie", sessionCookie(session.id, isSecure(c)))
  return c.json({ user: { id: user.id, email: user.email, role: user.role } })
})

auth.post("/logout", async (c) => {
  const session = await getSessionFromRequest(c.env, c.req.raw)
  if (session) await deleteSession(c.env, session.id)
  c.header("Set-Cookie", clearSessionCookie(isSecure(c)))
  return c.json({ ok: true })
})

auth.post("/magic-link", async (c) => {
  const body = await c.req.json<{ email?: string; turnstileToken?: string }>().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !email.includes("@")) return c.json({ error: "a valid email is required" }, 400)
  const humanVerified = await verifyTurnstile(c.env, body?.turnstileToken, c.req.header("CF-Connecting-IP"))
  if (!humanVerified) return c.json({ error: "verification failed, please try again" }, 400)

  // Always respond 202 regardless of whether the account exists, so this
  // endpoint can't be used to enumerate registered emails.
  const token = await issueMagicLinkToken(c.env, email)
  const url = magicLinkUrl(c.env.APP_ORIGIN, token)
  await sendMagicLinkEmail(c.env, email, url)
  return c.json({ ok: true }, 202)
})

auth.get("/verify", async (c) => {
  const token = c.req.query("token")
  if (!token) return c.json({ error: "missing token" }, 400)

  const email = await consumeMagicLinkToken(c.env, token)
  if (!email) return c.json({ error: "invalid or expired token" }, 401)

  let user = await findUserByEmail(c.env, email)
  let isNewUser = false
  if (!user) {
    user = await createUser(c.env, { email, emailVerified: true })
    isNewUser = true
  }
  const session = await createSession(c.env, user.id, {
    userAgent: c.req.header("User-Agent"),
    ip: c.req.header("CF-Connecting-IP"),
  })
  c.header("Set-Cookie", sessionCookie(session.id, isSecure(c)))
  if (isNewUser) {
    c.executionCtx.waitUntil(sendWelcomeEmail(c.env, user.email).catch((err) => console.error("welcome email failed:", err)))
  }
  return c.json({ user: { id: user.id, email: user.email, role: user.role } })
})

auth.post("/reset-password", async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>().catch(() => null)
  if (!body?.token || !body?.password) return c.json({ error: "token and password are required" }, 400)
  if (!isPasswordStrongEnough(body.password)) return c.json({ error: "password must be at least 8 characters" }, 400)

  const email = await consumeMagicLinkToken(c.env, body.token)
  if (!email) return c.json({ error: "invalid or expired token" }, 401)

  const user = await findUserByEmail(c.env, email)
  if (!user) return c.json({ error: "no account for this token" }, 404)

  const { hash, salt } = await hashPassword(body.password)
  await updatePassword(c.env, user.id, hash, salt)
  return c.json({ ok: true })
})

auth.get("/session", async (c) => {
  const session = await getSessionFromRequest(c.env, c.req.raw)
  if (!session) return c.json({ user: null }, 200)
  const user = await findUserById(c.env, session.userId)
  if (!user) return c.json({ user: null }, 200)
  return c.json({ user: { id: user.id, email: user.email, role: user.role } })
})

export default auth
