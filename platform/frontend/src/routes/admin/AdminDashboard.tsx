import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { adminApi, ApiError, type AdminStats, type AdminUser, type AdminApplication, type ApplicationStatus } from "../../api/client.js"
import { useAuth } from "../../api/AuthContext.js"

const STAT_LABELS: { key: keyof AdminStats; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "jobs", label: "Jobs scraped" },
  { key: "rankings", label: "Rankings" },
  { key: "applications", label: "Applications" },
  { key: "documents", label: "Documents generated" },
  { key: "scrapeQueries", label: "Scrape queries" },
]

function statusClass(status: ApplicationStatus): string {
  if (["hired", "offer"].includes(status)) return "strong"
  if (status === "interview") return "good"
  if (status === "applied" || status === "drafted") return "moderate"
  return "weak"
}

export default function AdminDashboard() {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [applications, setApplications] = useState<AdminApplication[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [userQuery, setUserQuery] = useState("")
  const [appQuery, setAppQuery] = useState("")

  function load() {
    setError(null)
    Promise.all([adminApi.stats(), adminApi.users(), adminApi.applications()])
      .then(([statsRes, usersRes, applicationsRes]) => {
        setStats(statsRes.stats)
        setUsers(usersRes.users)
        setApplications(applicationsRes.applications)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load admin data."))
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleRole(u: AdminUser) {
    const nextRole = u.role === "admin" ? "user" : "admin"
    setBusyUserId(u.id)
    setError(null)
    try {
      await adminApi.setUserRole(u.id, nextRole)
      setUsers((prev) => prev && prev.map((row) => (row.id === u.id ? { ...row, role: nextRole } : row)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update role.")
    } finally {
      setBusyUserId(null)
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!window.confirm(`Permanently delete ${u.email} and all of their data? This cannot be undone.`)) return
    setBusyUserId(u.id)
    setError(null)
    try {
      await adminApi.deleteUser(u.id)
      setUsers((prev) => prev && prev.filter((row) => row.id !== u.id))
      setApplications((prev) => prev && prev.filter((row) => row.userId !== u.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this user.")
    } finally {
      setBusyUserId(null)
    }
  }

  const filteredUsers = useMemo(() => {
    if (!users) return null
    const q = userQuery.trim().toLowerCase()
    return q ? users.filter((u) => u.email.toLowerCase().includes(q)) : users
  }, [users, userQuery])

  const filteredApplications = useMemo(() => {
    if (!applications) return null
    const q = appQuery.trim().toLowerCase()
    return q
      ? applications.filter((a) => [a.userEmail, a.company, a.role].some((v) => v.toLowerCase().includes(q)))
      : applications
  }, [applications, appQuery])

  return (
    <div className="app-shell">
      <h1>Admin dashboard</h1>
      <p className="muted">Platform-wide stats, user management, and every applicant's applications. Visible to admins only.</p>

      {error && <p className="error-text">{error}</p>}

      <div className="score-grid admin-stat-grid">
        {STAT_LABELS.map(({ key, label }) => (
          <div className="score-tile" key={key}>
            <div className="value">{stats ? stats[key] : "—"}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="admin-section-head">
          <h2>Users</h2>
          {users && users.length > 0 && (
            <input
              className="admin-search"
              type="search"
              placeholder="Filter by email…"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
          )}
        </div>
        {!users && !error && <p className="muted">Loading…</p>}
        {users && users.length === 0 && <p className="muted">No users yet.</p>}
        {filteredUsers && filteredUsers.length > 0 && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Verified</th>
                  <th>Profile</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr className="clickable-row" key={u.id} onClick={() => navigate(`/admin/users/${u.id}`)}>
                    <td>
                      <div className="admin-user-cell">
                        <span className="avatar-chip">{u.email[0]?.toUpperCase()}</span>
                        {u.email}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.role === "admin" ? "strong" : ""}`}>{u.role}</span>
                    </td>
                    <td>{u.emailVerified ? "Yes" : "No"}</td>
                    <td>{u.profileSaved ? "Saved" : "Empty"}</td>
                    <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="admin-row-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="secondary" disabled={busyUserId === u.id} onClick={() => toggleRole(u)}>
                        {u.role === "admin" ? "Revoke admin" : "Make admin"}
                        {u.id === currentUser?.id ? " (you)" : ""}
                      </button>
                      {u.id !== currentUser?.id && (
                        <button type="button" className="secondary danger" disabled={busyUserId === u.id} onClick={() => deleteUser(u)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filteredUsers && users && filteredUsers.length === 0 && users.length > 0 && (
          <p className="muted">No users match "{userQuery}".</p>
        )}
      </div>

      <div className="card">
        <div className="admin-section-head">
          <h2>Applicants</h2>
          {applications && applications.length > 0 && (
            <input
              className="admin-search"
              type="search"
              placeholder="Filter by applicant, company, role…"
              value={appQuery}
              onChange={(e) => setAppQuery(e.target.value)}
            />
          )}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Every application across every user, most recently updated first.
        </p>
        {!applications && !error && <p className="muted">Loading…</p>}
        {applications && applications.length === 0 && <p className="muted">No applications yet.</p>}
        {filteredApplications && filteredApplications.length > 0 && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplications.map((a) => (
                  <tr
                    key={a.id}
                    className={a.jobId ? "clickable-row" : ""}
                    onClick={() => a.jobId && navigate(`/jobs/${a.jobId}`)}
                  >
                    <td>{a.userEmail}</td>
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
        {filteredApplications && applications && filteredApplications.length === 0 && applications.length > 0 && (
          <p className="muted">No applications match "{appQuery}".</p>
        )}
      </div>
    </div>
  )
}
