import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { adminApi, ApiError, type AdminUserDetail as AdminUserDetailData, type ApplicationStatus } from "../../api/client.js"

function statusClass(status: ApplicationStatus): string {
  if (["hired", "offer"].includes(status)) return "strong"
  if (status === "interview") return "good"
  if (status === "applied" || status === "drafted") return "moderate"
  return "weak"
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<AdminUserDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    adminApi
      .userDetail(id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this user."))
  }, [id])

  async function handleDelete() {
    if (!id || !data) return
    if (!window.confirm(`Permanently delete ${data.user.email} and all of their data? This cannot be undone.`)) return
    setDeleting(true)
    setError(null)
    try {
      await adminApi.deleteUser(id)
      navigate("/admin")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this user.")
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <div className="app-shell">
        <Link to="/admin" className="landing-nav-link">
          ← Back to admin
        </Link>
        <p className="error-text" style={{ marginTop: 16 }}>
          {error}
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="app-shell">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const { user, profile, applications } = data

  return (
    <div className="app-shell">
      <Link to="/admin" className="landing-nav-link">
        ← Back to admin
      </Link>

      <div className="card" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="avatar-chip">{user.email[0]?.toUpperCase()}</div>
          <div>
            <h1 style={{ margin: 0 }}>{user.email}</h1>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <span className={`badge ${user.role === "admin" ? "strong" : ""}`}>{user.role}</span>
              <span className={`badge ${user.emailVerified ? "pass" : "flag"}`}>{user.emailVerified ? "verified" : "unverified"}</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted">Joined {new Date(user.createdAt).toLocaleDateString()}</div>
          <button type="button" className="secondary danger" onClick={handleDelete} disabled={deleting} style={{ marginTop: 8 }}>
            {deleting ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Profile</h2>
        {!profile && <p className="muted">No profile saved yet.</p>}
        {profile && (
          <div className="profile-summary-grid">
            <div>
              <div className="muted">Name</div>
              <div>{profile.name || "—"}</div>
            </div>
            <div>
              <div className="muted">Location</div>
              <div>{[profile.city, profile.country].filter(Boolean).join(", ") || "—"}</div>
            </div>
            <div>
              <div className="muted">Employment status</div>
              <div>{profile.employmentStatus || "—"}</div>
            </div>
            <div>
              <div className="muted">CV language</div>
              <div>{profile.cvLanguage || "—"}</div>
            </div>
            <div>
              <div className="muted">Auto-apply</div>
              <div>{profile.autoApplyEnabled ? "On" : "Off"}</div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="muted">Primary skills</div>
              <div>{profile.skills.primary.join(", ") || "—"}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Applications</h2>
        {applications.length === 0 && <p className="muted">No applications yet.</p>}
        {applications.length > 0 && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} className={a.jobId ? "clickable-row" : ""} onClick={() => a.jobId && navigate(`/jobs/${a.jobId}`)}>
                    <td>{a.company}</td>
                    <td>{a.role}</td>
                    <td>
                      <span className={`badge ${statusClass(a.status)}`}>{a.status}</span>
                    </td>
                    <td className="muted">{a.source ?? "—"}</td>
                    <td className="muted">{new Date(a.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
