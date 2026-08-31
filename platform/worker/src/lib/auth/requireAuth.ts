import type { Context, Next } from "hono"
import type { Env } from "../../types.js"
import { getSessionFromRequest } from "./session.js"
import { findUserById } from "../db/repositories/users.js"

/** Hono middleware: 401s unless a valid session cookie is present. Sets `c.set("userId", ...)`. */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: Next) {
  const session = await getSessionFromRequest(c.env, c.req.raw)
  if (!session) return c.json({ error: "not authenticated" }, 401)
  c.set("userId", session.userId)
  await next()
}

/**
 * Hono middleware: 403s unless the authenticated user has the admin role.
 * Must run after requireAuth (reads `c.get("userId")`).
 */
export async function requireAdmin(c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: Next) {
  const user = await findUserById(c.env, c.get("userId"))
  if (!user || user.role !== "admin") return c.json({ error: "admin access required" }, 403)
  await next()
}
