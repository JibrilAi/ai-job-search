import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth, requireAdmin } from "../lib/auth/requireAuth.js"
import { countAdmins, listUsers, setUserRole, type UserRole } from "../lib/db/repositories/users.js"

const admin = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
admin.use("*", requireAuth, requireAdmin)

interface CountRow {
  count: number
}

async function count(env: Env, sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<CountRow>()
  return row?.count ?? 0
}

admin.get("/stats", async (c) => {
  const [users, jobs, applications, rankings, documents, scrapeQueries] = await Promise.all([
    count(c.env, `SELECT COUNT(*) as count FROM users`),
    count(c.env, `SELECT COUNT(*) as count FROM jobs`),
    count(c.env, `SELECT COUNT(*) as count FROM applications`),
    count(c.env, `SELECT COUNT(*) as count FROM user_job_rankings`),
    count(c.env, `SELECT COUNT(*) as count FROM generated_documents`),
    count(c.env, `SELECT COUNT(*) as count FROM scrape_queries`),
  ])
  return c.json({ stats: { users, jobs, applications, rankings, documents, scrapeQueries } })
})

admin.get("/users", async (c) => {
  const users = await listUsers(c.env)
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      emailVerified: !!u.emailVerified,
      profileSaved: !!u.profileSaved,
      createdAt: u.createdAt,
    })),
  })
})

admin.patch("/users/:id/role", async (c) => {
  const targetId = c.req.param("id")
  const body = await c.req.json<{ role?: string }>().catch(() => null)
  const role = body?.role
  if (role !== "user" && role !== "admin") return c.json({ error: "role must be 'user' or 'admin'" }, 400)

  const actingUserId = c.get("userId")
  if (targetId === actingUserId && role === "user") {
    const admins = await countAdmins(c.env)
    if (admins <= 1) return c.json({ error: "cannot remove the last admin" }, 400)
  }

  await setUserRole(c.env, targetId, role as UserRole)
  return c.json({ ok: true })
})

export default admin
