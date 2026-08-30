import { useEffect, useState } from "react"
import { documentsApi, ApiError, type GeneratedDocument, type AtsReport } from "../api/client.js"

export default function DocumentStudio() {
  const [documents, setDocuments] = useState<GeneratedDocument[] | null>(null)
  const [cvJobId, setCvJobId] = useState("")
  const [jobId, setJobId] = useState("")
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

  async function generateCv() {
    setBusy("cv")
    setError(null)
    try {
      const { atsReport } = await documentsApi.generateCv(cvJobId.trim() || undefined)
      setLastReport(atsReport)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate your CV.")
    } finally {
      setBusy(null)
    }
  }

  async function generateCoverLetter() {
    if (!jobId.trim()) {
      setError("Enter a job ID first (find it on a job's detail page URL).")
      return
    }
    setBusy("cover")
    setError(null)
    try {
      const { atsReport } = await documentsApi.generateCoverLetter(jobId.trim())
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
        <h3>Generate CV</h3>
        <p className="muted">Uses your saved profile directly. Add a job ID to tailor the opening summary and highlighted skills to that posting.</p>
        <div className="form-row">
          <label>Job ID (optional)</label>
          <input value={cvJobId} onChange={(e) => setCvJobId(e.target.value)} placeholder="e.g. from /jobs/&lt;id&gt; -- leave blank for a generic CV" />
        </div>
        <button onClick={generateCv} disabled={busy !== null}>
          {busy === "cv" ? "Generating…" : "Generate CV"}
        </button>
      </div>

      <div className="card">
        <h3>Generate cover letter</h3>
        <p className="muted">Tailored to a specific job by its ID.</p>
        <div className="form-row">
          <label>Job ID</label>
          <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="e.g. from /jobs/&lt;id&gt;" />
        </div>
        <button onClick={generateCoverLetter} disabled={busy !== null}>
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
