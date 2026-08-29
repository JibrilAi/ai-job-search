import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { jobsApi, rankingsApi, ApiError, type JobSummary, type Ranking } from "../api/client.js"

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<JobSummary | null>(null)
  const [ranking, setRanking] = useState<Ranking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reRanking, setReRanking] = useState(false)

  function load() {
    if (!id) return
    jobsApi
      .get(id)
      .then(({ job, ranking }) => {
        setJob(job)
        setRanking(ranking)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this job."))
  }

  useEffect(load, [id])

  async function handleReRank() {
    if (!id) return
    setReRanking(true)
    try {
      await rankingsApi.reRank(id)
      // Ranking runs asynchronously via the queue; poll once after a short delay.
      setTimeout(load, 4000)
    } finally {
      setReRanking(false)
    }
  }

  if (error) return <div className="app-shell error-text">{error}</div>
  if (!job) return <div className="app-shell muted">Loading…</div>

  return (
    <div className="app-shell">
      <h1>
        {job.title} <span className="muted">at {job.company}</span>
      </h1>
      <p className="muted">
        {job.location ?? "Location not specified"} · <a href={job.sourceUrl} target="_blank" rel="noreferrer">view original posting</a>
      </p>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Your fit</h3>
          <button className="secondary" onClick={handleReRank} disabled={reRanking}>
            {reRanking ? "Queuing…" : "Re-rank"}
          </button>
        </div>

        {!ranking || ranking.status !== "ranked" ? (
          <p className="muted">Not ranked yet. New jobs are ranked automatically shortly after they're scraped.</p>
        ) : (
          <>
            <p>
              <strong>{ranking.rankVerdict}</strong> — {ranking.rankScore != null ? Math.round(ranking.rankScore) : "?"}/100
            </p>
            <div className="score-grid">
              <div className="score-tile">
                <div className="value">{ranking.technicalScore != null ? Math.round(ranking.technicalScore) : "—"}</div>
                <div className="label">Technical</div>
              </div>
              <div className="score-tile">
                <div className="value">{ranking.experienceScore != null ? Math.round(ranking.experienceScore) : "—"}</div>
                <div className="label">Experience</div>
              </div>
              <div className="score-tile">
                <div className="value">{ranking.behavioralScore != null ? Math.round(ranking.behavioralScore) : "—"}</div>
                <div className="label">Behavioral</div>
              </div>
              <div className="score-tile">
                <div className="value">{ranking.careerScore != null ? Math.round(ranking.careerScore) : "—"}</div>
                <div className="label">Career</div>
              </div>
            </div>

            <p>
              Location: <span className={`badge ${ranking.locationVerdict?.toLowerCase()}`}>{ranking.locationVerdict}</span>
              {"  "}
              Language: <span className={`badge ${ranking.languageGate?.toLowerCase()}`}>{ranking.languageGate}</span>
              {"  "}
              Eligibility: <span className="badge">{ranking.eligibilityVerdict}</span>
            </p>
            {ranking.languageNote && <p className="muted">{ranking.languageNote}</p>}

            {ranking.strengths.length > 0 && (
              <>
                <h4>Strengths</h4>
                <ul className="plain">
                  {ranking.strengths.map((s, i) => (
                    <li key={i}>+ {s}</li>
                  ))}
                </ul>
              </>
            )}
            {ranking.gaps.length > 0 && (
              <>
                <h4>Gaps</h4>
                <ul className="plain">
                  {ranking.gaps.map((g, i) => (
                    <li key={i}>- {g}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>Posting</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{job.description ?? "No description available."}</p>
      </div>
    </div>
  )
}
