import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { rankingsApi, ApiError, type RankedJobFeedRow } from "../api/client.js"

function verdictClass(verdict: string | null): string {
  if (!verdict) return ""
  if (verdict.startsWith("Strong")) return "strong"
  if (verdict.startsWith("Good")) return "good"
  if (verdict.startsWith("Moderate")) return "moderate"
  if (verdict.startsWith("Weak")) return "weak"
  return "poor"
}

function gateClass(v: string | null): string {
  if (v === "PASS") return "pass"
  if (v === "FAIL") return "fail"
  if (v === "FLAG") return "flag"
  return ""
}

export default function JobFeed() {
  const [rows, setRows] = useState<RankedJobFeedRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    rankingsApi
      .feed()
      .then(({ rankings }) => setRows(rankings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your job feed."))
  }, [])

  return (
    <div className="app-shell">
      <h1>Job feed</h1>
      <p className="muted">Ranked against your profile. Jobs are scraped once and shared; scores are yours alone.</p>

      {error && <p className="error-text">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="card">
          <p>No ranked jobs yet. New jobs are scraped on a schedule and ranked automatically once you have a profile saved.</p>
        </div>
      )}

      <div className="job-list">
        {rows?.map((row) => (
          <Link className="job-row" to={`/jobs/${row.jobId}`} key={row.jobId}>
            <div>
              <div>
                <strong>{row.title}</strong> — {row.company}
              </div>
              <div className="meta">
                {row.location ?? "Location not specified"}
                {row.deadline ? ` · deadline ${row.deadline}` : ""}
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                {row.locationVerdict && row.locationVerdict !== "PASS" && (
                  <span className={`badge ${gateClass(row.locationVerdict)}`}>location: {row.locationVerdict}</span>
                )}
                {row.languageGate && row.languageGate !== "PASS" && (
                  <span className={`badge ${gateClass(row.languageGate)}`}>language: {row.languageGate}</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className={`badge ${verdictClass(row.rankVerdict)}`}>{row.rankVerdict ?? "unranked"}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {row.rankScore != null ? `${Math.round(row.rankScore)}/100` : "—"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
