import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth, requireAdmin } from "../lib/auth/requireAuth.js"
import { countAdmins, deleteUser, findUserById, listUsers, setUserRole, type UserRole } from "../lib/db/repositories/users.js"
import { listAllApplications, listApplicationsForUser } from "../lib/db/repositories/applications.js"
import { getProfile } from "../lib/db/repositories/profiles.js"
import { listGeneratedDocumentsForUser } from "../lib/db/repositories/documents.js"
import { listGlobalScrapeQueries } from "../lib/db/repositories/scrapeQueries.js"
import {
  getScrapeSchedule,
  setScrapeIntervalMinutes,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
} from "../lib/db/repositories/scrapeSchedule.js"

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

admin.get("/users/:id", async (c) => {
  const targetId = c.req.param("id")
  const user = await findUserById(c.env, targetId)
  if (!user) return c.json({ error: "user not found" }, 404)

  const [profile, applications] = await Promise.all([
    getProfile(c.env, targetId),
    listApplicationsForUser(c.env, targetId),
  ])
  return c.json({
    user: { id: user.id, email: user.email, role: user.role, emailVerified: !!user.emailVerified, createdAt: user.createdAt },
    profile,
    applications,
  })
})

admin.get("/applications", async (c) => {
  const limit = Number(c.req.query("limit") ?? 100)
  const offset = Number(c.req.query("offset") ?? 0)
  const applications = await listAllApplications(c.env, {
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  })
  return c.json({ applications })
})

admin.get("/schedule", async (c) => {
  const [schedule, queries] = await Promise.all([getScrapeSchedule(c.env), listGlobalScrapeQueries(c.env)])
  const nextRunAt = schedule.lastRunAt
    ? new Date(new Date(schedule.lastRunAt).getTime() + schedule.intervalMinutes * 60_000).toISOString()
    : null
  return c.json({
    schedule: { intervalMinutes: schedule.intervalMinutes, lastRunAt: schedule.lastRunAt, nextRunAt },
    queries: queries.map((q) => ({ id: q.id, portal: q.portal, enabled: !!q.enabled, lastRunAt: q.lastRunAt })),
  })
})

admin.patch("/schedule", async (c) => {
  const body = await c.req.json<{ intervalMinutes?: number }>().catch(() => null)
  const intervalMinutes = body?.intervalMinutes
  if (
    typeof intervalMinutes !== "number" ||
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < MIN_INTERVAL_MINUTES ||
    intervalMinutes > MAX_INTERVAL_MINUTES
  ) {
    return c.json({ error: `intervalMinutes must be an integer between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES}` }, 400)
  }

  await setScrapeIntervalMinutes(c.env, intervalMinutes)
  return c.json({ ok: true })
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

admin.delete("/users/:id", async (c) => {
  const targetId = c.req.param("id")
  const actingUserId = c.get("userId")
  if (targetId === actingUserId) return c.json({ error: "cannot delete your own account here" }, 400)

  const target = await findUserById(c.env, targetId)
  if (!target) return c.json({ error: "user not found" }, 404)
  if (target.role === "admin") {
    const admins = await countAdmins(c.env)
    if (admins <= 1) return c.json({ error: "cannot delete the last admin" }, 400)
  }

  // Clean up R2 objects before the D1 rows referencing them are gone --
  // once generated_documents is deleted there's no way to find these keys.
  const documents = await listGeneratedDocumentsForUser(c.env, targetId)
  await Promise.all(documents.map((d) => c.env.DOCUMENTS_BUCKET.delete(d.r2Key)))

  await deleteUser(c.env, targetId)
  return c.json({ ok: true })
})

export default admin
