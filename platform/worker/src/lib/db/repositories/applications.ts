import type { Env } from "../../../types.js"

// Canonical status vocabulary from .claude/commands/outcome.md ("Tracker
// status vocabulary"): drafted is open-but-unsent; hired/rejected/no_response/
// offer_declined/withdrawn are final.
export type ApplicationStatus =
  | "drafted"
  // Set by the freehire.me auto-submit engine's "confirm" mode after it
  // fills the application form and stops short of the real submit action
  // -- see lib/documents/autoSubmit.ts. The user sends it themselves from
  // the tracker (POST /applications/:id/submit).
  | "ready_to_submit"
  | "applied"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "no_response"
  | "offer_declined"
  | "withdrawn"

export interface ApplicationRow {
  id: string
  userId: string
  jobId: string | null
  date: string | null
  company: string
  sector: string | null
  role: string
  roleType: string | null
  channel: string | null
  status: ApplicationStatus
  contactPerson: string | null
  fitRating: string | null
  notes: string | null
  cvDocumentId: string | null
  coverLetterDocumentId: string | null
  source: string | null
  deadline: string | null
  createdAt: string
  updatedAt: string
}

const SELECT_COLUMNS = `id, user_id as userId, job_id as jobId, date, company, sector, role, role_type as roleType,
  channel, status, contact_person as contactPerson, fit_rating as fitRating, notes,
  cv_document_id as cvDocumentId, cover_letter_document_id as coverLetterDocumentId,
  source, deadline, created_at as createdAt, updated_at as updatedAt`

export interface ApplicationInput {
  jobId?: string | null
  date?: string | null
  company: string
  sector?: string | null
  role: string
  roleType?: string | null
  channel?: string | null
  status?: ApplicationStatus
  contactPerson?: string | null
  fitRating?: string | null
  notes?: string | null
  cvDocumentId?: string | null
  coverLetterDocumentId?: string | null
  source?: string | null
  deadline?: string | null
}

export async function createApplication(env: Env, userId: string, input: ApplicationInput): Promise<ApplicationRow> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const status = input.status ?? "drafted"
  await env.DB.prepare(
    `INSERT INTO applications (
       id, user_id, job_id, date, company, sector, role, role_type, channel, status,
       contact_person, fit_rating, notes, cv_document_id, cover_letter_document_id,
       source, deadline, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      input.jobId ?? null,
      input.date ?? null,
      input.company,
      input.sector ?? null,
      input.role,
      input.roleType ?? null,
      input.channel ?? null,
      status,
      input.contactPerson ?? null,
      input.fitRating ?? null,
      input.notes ?? null,
      input.cvDocumentId ?? null,
      input.coverLetterDocumentId ?? null,
      input.source ?? null,
      input.deadline ?? null,
      now,
      now,
    )
    .run()

  const row = await getApplication(env, id, userId)
  if (!row) throw new Error("application insert failed to persist")
  return row
}

export async function getApplication(env: Env, id: string, userId: string): Promise<ApplicationRow | null> {
  return env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM applications WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<ApplicationRow>()
}

/** Used by the auto-draft pipeline to avoid redrafting on a re-rank. */
export async function findApplicationForJob(env: Env, userId: string, jobId: string): Promise<ApplicationRow | null> {
  return env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM applications WHERE user_id = ? AND job_id = ? LIMIT 1`)
    .bind(userId, jobId)
    .first<ApplicationRow>()
}

export async function listApplicationsForUser(env: Env, userId: string): Promise<ApplicationRow[]> {
  const { results } = await env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM applications WHERE user_id = ? ORDER BY updated_at DESC`)
    .bind(userId)
    .all<ApplicationRow>()
  return results
}

export interface AdminApplicationRow extends ApplicationRow {
  userEmail: string
}

/** Admin-only: every application across every user, most recently updated first. */
export async function listAllApplications(
  env: Env,
  opts: { limit?: number; offset?: number } = {},
): Promise<AdminApplicationRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.user_id as userId, u.email as userEmail, a.job_id as jobId, a.date, a.company, a.sector,
            a.role, a.role_type as roleType, a.channel, a.status, a.contact_person as contactPerson,
            a.fit_rating as fitRating, a.notes, a.cv_document_id as cvDocumentId,
            a.cover_letter_document_id as coverLetterDocumentId, a.source, a.deadline,
            a.created_at as createdAt, a.updated_at as updatedAt
     FROM applications a
     JOIN users u ON u.id = a.user_id
     ORDER BY a.updated_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(opts.limit ?? 100, opts.offset ?? 0)
    .all<AdminApplicationRow>()
  return results
}

/**
 * Status/notes update, following outcome.md Step 4's rule: touch only status
 * and notes, never blank other columns (deadline, source, etc.) on a status
 * change. `appendNote` appends a dated note rather than overwriting notes.
 */
export async function updateApplicationStatus(
  env: Env,
  id: string,
  userId: string,
  status: ApplicationStatus,
  appendNote?: string,
): Promise<ApplicationRow | null> {
  const existing = await getApplication(env, id, userId)
  if (!existing) return null

  const today = new Date().toISOString().slice(0, 10)
  const notes = appendNote ? [existing.notes, `${today}: ${appendNote}`].filter(Boolean).join("\n") : existing.notes

  await env.DB.prepare(`UPDATE applications SET status = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(status, notes, new Date().toISOString(), id, userId)
    .run()

  return getApplication(env, id, userId)
}

/** Attaches generated-document ids to an application, e.g. after auto-drafting. */
export async function updateApplicationDocuments(
  env: Env,
  id: string,
  userId: string,
  docs: { cvDocumentId?: string | null; coverLetterDocumentId?: string | null },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE applications SET
       cv_document_id = COALESCE(?, cv_document_id),
       cover_letter_document_id = COALESCE(?, cover_letter_document_id),
       updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(docs.cvDocumentId ?? null, docs.coverLetterDocumentId ?? null, new Date().toISOString(), id, userId)
    .run()
}
