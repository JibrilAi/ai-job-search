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
import { getJob } from "../lib/db/repositories/jobs.js"
import { getProfile } from "../lib/db/repositories/profiles.js"
import { getGeneratedDocument } from "../lib/db/repositories/documents.js"
import { findUserById } from "../lib/db/repositories/users.js"
import { runFreehireApplication } from "../lib/documents/autoSubmit.js"

const VALID_STATUSES: ApplicationStatus[] = [
  "drafted",
  "ready_to_submit",
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

// The "confirm" mode's send step: re-runs the same freehire.me fill
// automation autoDraftApplication used to stage this application, this
// time actually clicking submit. Only valid from "ready_to_submit" --
// that status is set exclusively by autoSubmit.ts's confirm-mode fill
// pass, so this never fires on a job/portal it hasn't already verified.
applications.post("/:id/submit", async (c) => {
  const userId = c.get("userId")
  const application = await getApplication(c.env, c.req.param("id"), userId)
  if (!application) return c.json({ error: "application not found" }, 404)
  if (application.status !== "ready_to_submit") {
    return c.json({ error: `application must be ready_to_submit to send (currently "${application.status}")` }, 400)
  }
  if (!application.jobId) return c.json({ error: "this application has no linked job to submit to" }, 400)

  const [job, profile, user] = await Promise.all([
    getJob(c.env, application.jobId),
    getProfile(c.env, userId),
    findUserById(c.env, userId),
  ])
  if (!job) return c.json({ error: "the linked job no longer exists" }, 404)
  if (!profile || !user) return c.json({ error: "profile not found" }, 404)

  const [cvDoc, coverLetterDoc] = await Promise.all([
    application.cvDocumentId ? getGeneratedDocument(c.env, application.cvDocumentId, userId) : null,
    application.coverLetterDocumentId ? getGeneratedDocument(c.env, application.coverLetterDocumentId, userId) : null,
  ])

  try {
    const outcome = await runFreehireApplication(c.env, { job, profile, userEmail: user.email, cvDoc, coverLetterDoc, submit: true })
    const row = await updateApplicationStatus(c.env, application.id, userId, outcome.status, outcome.note)
    return c.json({ application: row })
  } catch (err) {
    console.error("application submit failed:", err)
    return c.json({ error: "could not submit this application automatically, please apply manually" }, 502)
  }
})

export default applications
