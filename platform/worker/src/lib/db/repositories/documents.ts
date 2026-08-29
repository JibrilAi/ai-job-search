import type { Env } from "../../../types.js"

export interface GeneratedDocumentRow {
  id: string
  userId: string
  applicationId: string | null
  type: "cv" | "cover_letter"
  templateId: string
  r2Key: string
  atsVerified: number
  atsReportJson: string | null
  createdAt: string
}

export async function insertGeneratedDocument(
  env: Env,
  params: {
    userId: string
    applicationId?: string | null
    type: "cv" | "cover_letter"
    templateId: string
    r2Key: string
    atsVerified: boolean
    atsReportJson: string
  },
): Promise<GeneratedDocumentRow> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO generated_documents (id, user_id, application_id, type, template_id, r2_key, ats_verified, ats_report_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      params.userId,
      params.applicationId ?? null,
      params.type,
      params.templateId,
      params.r2Key,
      params.atsVerified ? 1 : 0,
      params.atsReportJson,
      createdAt,
    )
    .run()
  return {
    id,
    userId: params.userId,
    applicationId: params.applicationId ?? null,
    type: params.type,
    templateId: params.templateId,
    r2Key: params.r2Key,
    atsVerified: params.atsVerified ? 1 : 0,
    atsReportJson: params.atsReportJson,
    createdAt,
  }
}

export async function getGeneratedDocument(env: Env, id: string, userId: string): Promise<GeneratedDocumentRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id as userId, application_id as applicationId, type, template_id as templateId,
            r2_key as r2Key, ats_verified as atsVerified, ats_report_json as atsReportJson, created_at as createdAt
     FROM generated_documents WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first<GeneratedDocumentRow>()
}

export async function listGeneratedDocumentsForUser(env: Env, userId: string): Promise<GeneratedDocumentRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, user_id as userId, application_id as applicationId, type, template_id as templateId,
            r2_key as r2Key, ats_verified as atsVerified, ats_report_json as atsReportJson, created_at as createdAt
     FROM generated_documents WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all<GeneratedDocumentRow>()
  return results
}
