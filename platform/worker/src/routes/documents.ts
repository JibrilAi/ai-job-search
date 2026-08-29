import { Hono } from "hono"
import type { Env } from "../types.js"
import { requireAuth } from "../lib/auth/requireAuth.js"
import { getProfile } from "../lib/db/repositories/profiles.js"
import { findUserById } from "../lib/db/repositories/users.js"
import { getJob } from "../lib/db/repositories/jobs.js"
import { insertGeneratedDocument, listGeneratedDocumentsForUser, getGeneratedDocument } from "../lib/db/repositories/documents.js"
import { renderCvHtml } from "../lib/documents/cvTemplate.js"
import { renderCoverLetterHtml } from "../lib/documents/coverLetterTemplate.js"
import { draftCoverLetter } from "../lib/documents/coverLetterDraft.js"
import { renderHtmlToPdf } from "../lib/documents/browserRender.js"
import { verifyAtsTextLayer } from "../lib/documents/verifyPdf.js"

const documents = new Hono<{ Bindings: Env; Variables: { userId: string } }>()
documents.use("*", requireAuth)

documents.get("/", async (c) => {
  const rows = await listGeneratedDocumentsForUser(c.env, c.get("userId"))
  return c.json({ documents: rows })
})

documents.post("/cv", async (c) => {
  const userId = c.get("userId")
  const [profile, user] = await Promise.all([getProfile(c.env, userId), findUserById(c.env, userId)])
  if (!profile) return c.json({ error: "save your profile before generating a CV" }, 400)
  if (!user) return c.json({ error: "user not found" }, 404)

  const body = await c.req.json<{ applicationId?: string }>().catch(() => ({}) as { applicationId?: string })

  const html = renderCvHtml(profile, user.email)
  const pdf = await renderHtmlToPdf(c.env, html)
  // Verify against a copy: unpdf/pdf.js detaches the ArrayBuffer it's given
  // (transferable-object semantics), which would otherwise zero out `pdf`
  // before the R2 upload below runs -- found by exercising this against a
  // real Browser-Rendering PDF locally (the R2 object came back empty).
  const report = await verifyAtsTextLayer(pdf.slice(0))

  const r2Key = `users/${userId}/generated/${crypto.randomUUID()}.pdf`
  await c.env.DOCUMENTS_BUCKET.put(r2Key, pdf, { httpMetadata: { contentType: "application/pdf" } })

  const doc = await insertGeneratedDocument(c.env, {
    userId,
    applicationId: body.applicationId ?? null,
    type: "cv",
    templateId: "default-cv-template",
    r2Key,
    atsVerified: report.passed,
    atsReportJson: JSON.stringify(report),
  })

  return c.json({ document: doc, atsReport: report }, 201)
})

documents.post("/cover-letter", async (c) => {
  const userId = c.get("userId")
  const body = await c.req.json<{ jobId?: string; applicationId?: string }>().catch(() => null)
  if (!body?.jobId) return c.json({ error: "jobId is required" }, 400)

  const [profile, user, job] = await Promise.all([
    getProfile(c.env, userId),
    findUserById(c.env, userId),
    getJob(c.env, body.jobId),
  ])
  if (!profile) return c.json({ error: "save your profile before generating a cover letter" }, 400)
  if (!user) return c.json({ error: "user not found" }, 404)
  if (!job) return c.json({ error: "job not found" }, 404)

  const content = await draftCoverLetter(c.env, { job, profile })
  const html = renderCoverLetterHtml(profile, user.email, content)
  const pdf = await renderHtmlToPdf(c.env, html)
  // Verify against a copy: unpdf/pdf.js detaches the ArrayBuffer it's given
  // (transferable-object semantics), which would otherwise zero out `pdf`
  // before the R2 upload below runs -- found by exercising this against a
  // real Browser-Rendering PDF locally (the R2 object came back empty).
  const report = await verifyAtsTextLayer(pdf.slice(0))

  const r2Key = `users/${userId}/generated/${crypto.randomUUID()}.pdf`
  await c.env.DOCUMENTS_BUCKET.put(r2Key, pdf, { httpMetadata: { contentType: "application/pdf" } })

  const doc = await insertGeneratedDocument(c.env, {
    userId,
    applicationId: body.applicationId ?? null,
    type: "cover_letter",
    templateId: "default-cover-letter-template",
    r2Key,
    atsVerified: report.passed,
    atsReportJson: JSON.stringify(report),
  })

  return c.json({ document: doc, atsReport: report }, 201)
})

documents.get("/:id/download", async (c) => {
  const doc = await getGeneratedDocument(c.env, c.req.param("id"), c.get("userId"))
  if (!doc) return c.json({ error: "document not found" }, 404)

  const object = await c.env.DOCUMENTS_BUCKET.get(doc.r2Key)
  if (!object) return c.json({ error: "document file missing from storage" }, 404)

  return new Response(object.body, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${doc.type}-${doc.id}.pdf"` },
  })
})

export default documents
