import type { Context, Next } from "hono"
import type { Env } from "../../types.js"
import { getSessionFromRequest } from "./session.js"

/** Hono middleware: 401s unless a valid session cookie is present. Sets `c.set("userId", ...)`. */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: Next) {
  const session = await getSessionFromRequest(c.env, c.req.raw)
  if (!session) return c.json({ error: "not authenticated" }, 401)
  c.set("userId", session.userId)
  await next()
}
