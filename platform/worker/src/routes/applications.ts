import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import {
  createApplication,
  getApplication,
  listApplicationsForUser,
  updateApplicationStatus,
  type ApplicationInput,
  type ApplicationStatus,
} from "../lib/db/repositories/applications.js"

const VALID_STATUSES: ApplicationStatus[] = [
  "drafted",
  "applied",
  "interview",
  "offer",
  "hired",
  "rejected",
  "no_response",
  "offer_declined",
  "withdrawn",
]

const applications = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
applications.use("*", requireAuth)

applications.get("/", async (c) => {
  const rows = await listApplicationsForUser(c.env, c.get("userId"))
  return c.json({ applications: rows })
})

applications.post("/", async (c) => {
  const body = await c.req.json<ApplicationInput>().catch(() => null)
  if (!body?.company || !body?.role) return c.json({ error: "company and role are required" }, 400)
  const row = await createApplication(c.env, c.get("userId"), body)
  return c.json({ application: row }, 201)
})

applications.get("/:id", async (c) => {
  const row = await getApplication(c.env, c.req.param("id"), c.get("userId"))
  if (!row) return c.json({ error: "application not found" }, 404)
  return c.json({ application: row })
})

applications.patch("/:id/status", async (c) => {
  const body = await c.req.json<{ status?: string; note?: string }>().catch(() => null)
  if (!body?.status || !VALID_STATUSES.includes(body.status as ApplicationStatus)) {
    return c.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, 400)
  }
  const row = await updateApplicationStatus(c.env, c.req.param("id"), c.get("userId"), body.status as ApplicationStatus, body.note)
  if (!row) return c.json({ error: "application not found" }, 404)
  return c.json({ application: row })
})

export default applications
