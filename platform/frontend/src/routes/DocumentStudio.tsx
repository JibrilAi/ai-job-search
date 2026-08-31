import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { documentsApi, rankingsApi, ApiError, type GeneratedDocument, type AtsReport, type RankedJobFeedRow } from "../api/client.js"

export default function DocumentStudio() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [documents, setDocuments] = useState<GeneratedDocument[] | null>(null)
  const [jobs, setJobs] = useState<RankedJobFeedRow[] | null>(null)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [targetJobId, setTargetJobId] = useState(searchParams.get("jobId") ?? "")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"cv" | "cover" | null>(null)
  const [lastReport, setLastReport] = useState<AtsReport | null>(null)

  function load() {
    documentsApi
      .list()
      .then(({ documents }) => setDocuments(documents))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your documents."))
  }

  useEffect(load, [])

  useEffect(() => {
    rankingsApi
      .feed(true)
      .then(({ rankings }) => setJobs(rankings))
      .catch((err) => setJobsError(err instanceof ApiError ? err.message : "Could not load your jobs."))
  }, [])

  function selectTargetJob(next: string) {
    setTargetJobId(next)
    setSearchParams(next ? { jobId: next } : {})
  }

  async function generateCv() {
    setBusy("cv")
    setError(null)
    try {
      const { atsReport } = await documentsApi.generateCv(targetJobId || undefined)
      setLastReport(atsReport)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate your CV.")
    } finally {
      setBusy(null)
    }
  }

  async function generateCoverLetter() {
    if (!targetJobId) {
      setError("Pick a target job first — a cover letter is always written for a specific role.")
      return
    }
    setBusy("cover")
    setError(null)
    try {
      const { atsReport } = await documentsApi.generateCoverLetter(targetJobId)
      setLastReport(atsReport)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate your cover letter.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="app-shell">
      <h1>Document studio</h1>
      <p className="muted">Generate a tailored CV or cover letter as a PDF, rendered from your profile.</p>

      <div className="card">
        <h3>Target job</h3>
        <p className="muted">
          Pick the job you're applying to — it tailors both documents below. Leave it unselected to generate a generic
          CV (cover letters always need a specific job).
        </p>
        {jobsError && <p className="error-text">{jobsError}</p>}
        <div className="form-row">
          <label>Job</label>
          <select value={targetJobId} onChange={(e) => selectTargetJob(e.target.value)}>
            <option value="">No specific job</option>
            {jobs?.map((j) => (
              <option key={j.jobId} value={j.jobId}>
                {j.title} — {j.company}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3>Generate CV</h3>
        <p className="muted">Uses your saved profile directly. With a target job selected, tailors the opening summary and highlighted skills to it.</p>
        <button onClick={generateCv} disabled={busy !== null}>
          {busy === "cv" ? "Generating…" : "Generate CV"}
        </button>
      </div>

      <div className="card">
        <h3>Generate cover letter</h3>
        <p className="muted">Requires a target job, selected above.</p>
        <button onClick={generateCoverLetter} disabled={busy !== null || !targetJobId}>
          {busy === "cover" ? "Drafting…" : "Generate cover letter"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {lastReport && (
        <p className={lastReport.passed ? "muted" : "error-text"}>
          ATS check: {lastReport.passed ? "passed" : "warnings found"} ({lastReport.pageCount} page(s), {lastReport.charCount} chars)
          {lastReport.warnings.length > 0 && ` — ${lastReport.warnings.join("; ")}`}
        </p>
      )}

      <div className="card">
        <h3>Your documents</h3>
        {!documents && <p className="muted">Loading…</p>}
        {documents && documents.length === 0 && <p className="muted">No documents generated yet.</p>}
        <ul className="plain">
          {documents?.map((doc) => (
            <li key={doc.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span>
                {doc.type === "cv" ? "CV" : "Cover letter"} — {new Date(doc.createdAt).toLocaleString()}
                {" "}
                <span className={`badge ${doc.atsVerified ? "pass" : "flag"}`}>{doc.atsVerified ? "ATS OK" : "ATS warning"}</span>
              </span>
              <a href={documentsApi.downloadUrl(doc.id)} target="_blank" rel="noreferrer">
                Download
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
