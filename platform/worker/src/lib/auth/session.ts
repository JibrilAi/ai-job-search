import type { Env } from "../../types.js"

const SESSION_COOKIE = "session"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface Session {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
}

export async function createSession(
  env: Env,
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<Session> {
  const id = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, now.toISOString(), expiresAt.toISOString(), meta.userAgent ?? null, meta.ip ?? null)
    .run()
  return { id, userId, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() }
}

export async function getSessionFromRequest(env: Env, request: Request): Promise<Session | null> {
  const cookieHeader = request.headers.get("Cookie")
  if (!cookieHeader) return null
  const sessionId = parseCookie(cookieHeader, SESSION_COOKIE)
  if (!sessionId) return null

  const row = await env.DB.prepare(
    `SELECT id, user_id as userId, created_at as createdAt, expires_at as expiresAt FROM sessions WHERE id = ?`,
  )
    .bind(sessionId)
    .first<Session>()
  if (!row) return null
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run()
    return null
  }
  return row
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run()
}

export async function deleteAllSessionsForUser(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run()
}

export function sessionCookie(sessionId: string, secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=${sessionId}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${SESSION_TTL_SECONDS}`]
  if (secure) attrs.push("Secure")
  return attrs.join("; ")
}

export function clearSessionCookie(secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"]
  if (secure) attrs.push("Secure")
  return attrs.join("; ")
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";")
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return rest.join("=")
  }
  return null
}
