import { useEffect, useState } from "react"
import { applicationsApi, ApiError, type Application, type ApplicationStatus } from "../api/client.js"

const STATUSES: ApplicationStatus[] = [
  "drafted",
  "applied",
  "interview",
  "offer",
  "hired",
  "rejected",
  "no_response",
  "offer_declined",
  "withdrawn",
]

function statusClass(status: ApplicationStatus): string {
  if (["hired", "offer"].includes(status)) return "strong"
  if (status === "interview") return "good"
  if (status === "applied" || status === "drafted") return "moderate"
  return "weak"
}

export default function ApplicationTracker() {
  const [applications, setApplications] = useState<Application[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [company, setCompany] = useState("")
  const [role, setRole] = useState("")
  const [creating, setCreating] = useState(false)

  function load() {
    applicationsApi
      .list()
      .then(({ applications }) => setApplications(applications))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your applications."))
  }

  useEffect(load, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!company.trim() || !role.trim()) return
    setCreating(true)
    try {
      await applicationsApi.create({ company: company.trim(), role: role.trim() })
      setCompany("")
      setRole("")
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that application.")
    } finally {
      setCreating(false)
    }
  }

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    try {
      await applicationsApi.updateStatus(id, status)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.")
    }
  }

  return (
    <div className="app-shell">
      <h1>Application tracker</h1>

      <div className="card">
        <h3>Add an application</h3>
        <form onSubmit={handleCreate}>
          <div className="form-grid">
            <div className="form-row">
              <label>Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>Role</label>
              <input value={role} onChange={(e) => setRole(e.target.value)} required />
            </div>
          </div>
          <button type="submit" disabled={creating}>
            {creating ? "Adding…" : "Add application"}
          </button>
        </form>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!applications && <p className="muted">Loading…</p>}
      {applications && applications.length === 0 && (
        <div className="card">
          <p className="muted">No applications tracked yet.</p>
        </div>
      )}

      <div className="job-list">
        {applications?.map((app) => (
          <div className="job-row" key={app.id} style={{ cursor: "default" }}>
            <div>
              <strong>{app.role}</strong> — {app.company}
              <div className="meta">
                {app.sector ?? "No sector"} · updated {new Date(app.updatedAt).toLocaleDateString()}
                {app.deadline ? ` · deadline ${app.deadline}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`badge ${statusClass(app.status)}`}>{app.status}</span>
              <select value={app.status} onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
