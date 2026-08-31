import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { rankingsApi, applicationsApi, profileApi, ApiError, type RankedJobFeedRow, type Application, type Profile } from "../api/client.js"

const ACTIVE_STATUSES = new Set(["drafted", "applied", "interview", "offer"])
const PAGE_SIZE = 20

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

function statusClass(status: string): string {
  if (["hired", "offer"].includes(status)) return "strong"
  if (status === "interview") return "good"
  if (status === "applied" || status === "drafted") return "moderate"
  return "weak"
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.round(ms / 86_400_000)
}

export default function JobFeed() {
  const [rows, setRows] = useState<RankedJobFeedRow[] | null>(null)
  const [applications, setApplications] = useState<Application[] | null>(null)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [includeVetoed, setIncludeVetoed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    setRows(null)
    setVisibleCount(PAGE_SIZE)
    rankingsApi
      .feed(includeVetoed)
      .then(({ rankings }) => setRows(rankings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your job feed."))
  }, [includeVetoed])

  useEffect(() => {
    applicationsApi.list().then(({ applications }) => setApplications(applications)).catch(() => setApplications([]))
    profileApi.get().then(({ profile }) => setProfile(profile)).catch(() => setProfile(null))
  }, [])

  const strongMatches = rows?.filter((r) => r.rankVerdict?.startsWith("Strong") || r.rankVerdict?.startsWith("Good")).length ?? null
  const activeApplications = applications?.filter((a) => ACTIVE_STATUSES.has(a.status)).length ?? null
  const profileIncomplete = profile !== undefined && (!profile || !profile.name)

  const today = new Date().toISOString().slice(0, 10)
  const upcomingDeadlines = (applications ?? [])
    .filter((a) => a.deadline && a.deadline >= today && ACTIVE_STATUSES.has(a.status))
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))
    .slice(0, 3)

  const recentActivity = [...(applications ?? [])]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 3)

  return (
    <div className="app-shell">
      <h1>Dashboard</h1>
      <p className="muted">Ranked against your profile. Jobs are scraped once and shared; scores are yours alone.</p>

      {profileIncomplete && (
        <div className="card banner-card">
          <div>
            <strong>Your profile is empty.</strong>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Add your skills and experience to start getting ranked jobs and tailored documents.
            </p>
          </div>
          <Link to="/profile" className="btn-primary">
            Complete profile
          </Link>
        </div>
      )}

      <div className="score-grid dashboard-stat-grid">
        <div className="score-tile">
          <div className="value">{rows?.length ?? "—"}</div>
          <div className="label">Ranked jobs</div>
        </div>
        <div className="score-tile">
          <div className="value">{strongMatches ?? "—"}</div>
          <div className="label">Strong / good matches</div>
        </div>
        <div className="score-tile">
          <div className="value">{applications?.length ?? "—"}</div>
          <div className="label">Applications tracked</div>
        </div>
        <div className="score-tile">
          <div className="value">{activeApplications ?? "—"}</div>
          <div className="label">In progress</div>
        </div>
      </div>

      {(upcomingDeadlines.length > 0 || recentActivity.length > 0) && (
        <div className="dashboard-widgets">
          {upcomingDeadlines.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Upcoming deadlines</h3>
              <ul className="plain">
                {upcomingDeadlines.map((a) => (
                  <li key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                    <span>
                      {a.role} — {a.company}
                    </span>
                    <span className="muted">
                      {daysUntil(a.deadline!) === 0 ? "today" : `${daysUntil(a.deadline!)}d`}
                    </span>
                  </li>
                ))}
              </ul>
              <Link to="/applications" className="muted" style={{ textDecoration: "none" }}>
                View all applications →
              </Link>
            </div>
          )}
          {recentActivity.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Recent activity</h3>
              <ul className="plain">
                {recentActivity.map((a) => (
                  <li key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                    <span>
                      {a.role} — {a.company}
                    </span>
                    <span className={`badge ${statusClass(a.status)}`}>{a.status}</span>
                  </li>
                ))}
              </ul>
              <Link to="/applications" className="muted" style={{ textDecoration: "none" }}>
                View all applications →
              </Link>
            </div>
          )}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 6, margin: "20px 0 12px" }}>
        <input type="checkbox" checked={includeVetoed} onChange={(e) => setIncludeVetoed(e.target.checked)} />
        Show jobs outside your location, language, or eligibility (hidden by default)
      </label>

      {error && <p className="error-text">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="card">
          <p>No ranked jobs yet. New jobs are scraped on a schedule and ranked automatically once you have a profile saved.</p>
        </div>
      )}

      <div className="job-list">
        {rows?.slice(0, visibleCount).map((row) => (
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

      {rows && visibleCount < rows.length && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button type="button" className="secondary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Load more ({rows.length - visibleCount} more)
          </button>
        </div>
      )}
    </div>
  )
}
