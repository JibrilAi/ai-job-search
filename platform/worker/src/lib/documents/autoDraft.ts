import type { Env } from "../../types.js"
import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"
import { createApplication, findApplicationForJob, updateApplicationDocuments } from "../db/repositories/applications.js"
import { insertGeneratedDocument } from "../db/repositories/documents.js"
import { renderCvHtml } from "./cvTemplate.js"
import { renderCoverLetterHtml } from "./coverLetterTemplate.js"
import { draftCoverLetter } from "./coverLetterDraft.js"
import { draftCvTailoring } from "./cvTailoring.js"
import { renderHtmlToPdf } from "./browserRender.js"
import { verifyAtsTextLayer } from "./verifyPdf.js"

/**
 * Auto-apply, scoped deliberately: called from the rank consumer when a
 * user has opted in (profile.autoApplyEnabled) and a job just ranked
 * Strong/Good Fit for them. Drafts a tailored CV, a cover letter, and a
 * "drafted" application entry so it's one click away -- it never submits
 * anything to the job board itself. Real job-board apply flows are too
 * heterogeneous (some are a plain form, many route through an ATS like
 * Greenhouse/Workday, LinkedIn requires an authenticated session and
 * automating it risks the account/IP getting blocked) to submit
 * unattended, and a wrong or hallucinated submission under someone's real
 * name to a real employer isn't something to risk without a human looking
 * first.
 *
 * Idempotent per (user, job): if an application already exists (drafted by
 * this same function on an earlier ranking pass, or created manually by
 * the user), this is a no-op, so a re-rank never redoes the work or
 * clobbers a document the user already reviewed.
 */
export async function autoDraftApplication(
  env: Env,
  params: { userId: string; userEmail: string; job: JobRow; profile: Profile },
): Promise<void> {
  const { userId, userEmail, job, profile } = params

  const existing = await findApplicationForJob(env, userId, job.id)
  if (existing) return

  const application = await createApplication(env, userId, {
    jobId: job.id,
    company: job.company,
    role: job.title,
    source: job.portal,
    status: "drafted",
  })

  let cvDocumentId: string | null = null
  let coverLetterDocumentId: string | null = null

  try {
    let tailoring = null
    try {
      tailoring = await draftCvTailoring(env, { job, profile })
    } catch (err) {
      console.error("auto-draft: CV tailoring failed, falling back to a generic CV:", err)
    }
    const cvHtml = renderCvHtml(profile, userEmail, tailoring)
    const cvPdf = await renderHtmlToPdf(env, cvHtml)
    // See routes/documents.ts's identical comment: verify against a copy,
    // since unpdf/pdf.js detaches the ArrayBuffer it's given.
    const cvReport = await verifyAtsTextLayer(cvPdf.slice(0))
    const cvR2Key = `users/${userId}/generated/${crypto.randomUUID()}.pdf`
    await env.DOCUMENTS_BUCKET.put(cvR2Key, cvPdf, { httpMetadata: { contentType: "application/pdf" } })
    const cvDoc = await insertGeneratedDocument(env, {
      userId,
      applicationId: application.id,
      type: "cv",
      templateId: "default-cv-template",
      r2Key: cvR2Key,
      atsVerified: cvReport.passed,
      atsReportJson: JSON.stringify(cvReport),
    })
    cvDocumentId = cvDoc.id
  } catch (err) {
    // A CV/cover-letter generation failure shouldn't lose the drafted
    // application itself -- the user still sees it in their tracker and can
    // generate documents manually from there.
    console.error("auto-draft: CV generation failed:", err)
  }

  try {
    const content = await draftCoverLetter(env, { job, profile })
    const clHtml = renderCoverLetterHtml(profile, userEmail, content)
    const clPdf = await renderHtmlToPdf(env, clHtml)
    const clReport = await verifyAtsTextLayer(clPdf.slice(0))
    const clR2Key = `users/${userId}/generated/${crypto.randomUUID()}.pdf`
    await env.DOCUMENTS_BUCKET.put(clR2Key, clPdf, { httpMetadata: { contentType: "application/pdf" } })
    const clDoc = await insertGeneratedDocument(env, {
      userId,
      applicationId: application.id,
      type: "cover_letter",
      templateId: "default-cover-letter-template",
      r2Key: clR2Key,
      atsVerified: clReport.passed,
      atsReportJson: JSON.stringify(clReport),
    })
    coverLetterDocumentId = clDoc.id
  } catch (err) {
    console.error("auto-draft: cover letter generation failed:", err)
  }

  if (cvDocumentId || coverLetterDocumentId) {
    await updateApplicationDocuments(env, application.id, userId, { cvDocumentId, coverLetterDocumentId })
  }
}
