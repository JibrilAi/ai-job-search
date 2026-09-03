import type { Env } from "../../types.js"
import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"
import {
  createApplication,
  findApplicationForJob,
  updateApplicationDocuments,
  updateApplicationStatus,
  setApprovedDocuments,
} from "../db/repositories/applications.js"
import { insertGeneratedDocument, type GeneratedDocumentRow } from "../db/repositories/documents.js"
import { renderCvHtml } from "./cvTemplate.js"
import { renderCoverLetterHtml } from "./coverLetterTemplate.js"
import { draftCoverLetter } from "./coverLetterDraft.js"
import { draftCvTailoring } from "./cvTailoring.js"
import { renderHtmlToPdf } from "./browserRender.js"
import { verifyAtsTextLayer } from "./verifyPdf.js"
import { runFreehireApplication } from "./autoSubmit.js"

/**
 * Auto-apply: called from the rank consumer when a user has opted in
 * (profile.autoApplyEnabled) and a job just ranked Strong/Good Fit for
 * them. Drafts a tailored CV, a cover letter, and a "drafted" application
 * entry so it's one click away. By default this is as far as it goes --
 * it never submits anything to the job board itself. Real job-board apply
 * flows are too heterogeneous (some are a plain form, many route through
 * an ATS like Greenhouse/Workday) and a wrong or hallucinated submission
 * under someone's real name to a real employer isn't something to risk
 * without a human looking first.
 *
 * If the user has ALSO opted into profile.autoSubmitMode ("confirm" or
 * "unattended"), and the job is from freehire.me specifically, this goes
 * one step further and calls out to autoSubmit.ts's browser automation to
 * actually fill (and, in "unattended" mode, submit) the application form.
 * LinkedIn is deliberately excluded from this even with auto-submit on --
 * see autoSubmit.ts's docstring (account-ban risk, ToS).
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

  let cvDoc: GeneratedDocumentRow | null = null
  let coverLetterDoc: GeneratedDocumentRow | null = null

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
    cvDoc = await insertGeneratedDocument(env, {
      userId,
      applicationId: application.id,
      type: "cv",
      templateId: "default-cv-template",
      r2Key: cvR2Key,
      atsVerified: cvReport.passed,
      atsReportJson: JSON.stringify(cvReport),
    })
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
    coverLetterDoc = await insertGeneratedDocument(env, {
      userId,
      applicationId: application.id,
      type: "cover_letter",
      templateId: "default-cover-letter-template",
      r2Key: clR2Key,
      atsVerified: clReport.passed,
      atsReportJson: JSON.stringify(clReport),
    })
  } catch (err) {
    console.error("auto-draft: cover letter generation failed:", err)
  }

  if (cvDoc || coverLetterDoc) {
    await updateApplicationDocuments(env, application.id, userId, {
      cvDocumentId: cvDoc?.id ?? null,
      coverLetterDocumentId: coverLetterDoc?.id ?? null,
    })
  }

  // Auto-submit is opt-in on top of auto-draft, and scoped to freehire.me
  // only -- see autoSubmit.ts's docstring for why LinkedIn is excluded.
  // A submit failure must never lose the drafted application: it just
  // stays at "drafted" with a note, same as if auto-submit were off.
  if (profile.autoSubmitMode !== "off" && job.portal === "freehire") {
    try {
      const outcome = await runFreehireApplication(env, {
        job,
        profile,
        userEmail,
        cvDoc,
        coverLetterDoc,
        submit: profile.autoSubmitMode === "unattended",
      })
      // Pin exactly what was just filled/reviewed -- see
      // setApprovedDocuments's docstring. Set for both outcomes (not just
      // ready_to_submit): "unattended" already submitted with these same
      // docs, and recording them keeps the audit trail honest either way.
      await setApprovedDocuments(env, application.id, userId, { cvDocumentId: cvDoc?.id ?? null, coverLetterDocumentId: coverLetterDoc?.id ?? null })
      await updateApplicationStatus(env, application.id, userId, outcome.status, outcome.note)
    } catch (err) {
      console.error("auto-draft: freehire auto-submit failed:", err)
      await updateApplicationStatus(env, application.id, userId, "drafted", "Auto-submit failed, please apply manually.")
    }
  }
}
