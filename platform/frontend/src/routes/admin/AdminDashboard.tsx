import { useEffect, useState } from "react"
import { adminApi, ApiError, type AdminStats, type AdminUser } from "../../api/client.js"
import { useAuth } from "../../api/AuthContext.js"

const STAT_LABELS: { key: keyof AdminStats; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "jobs", label: "Jobs scraped" },
  { key: "rankings", label: "Rankings" },
  { key: "applications", label: "Applications" },
  { key: "documents", label: "Documents generated" },
  { key: "scrapeQueries", label: "Scrape queries" },
]

export default function AdminDashboard() {
  const { user: currentUser } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  function load() {
    setError(null)
    Promise.all([adminApi.stats(), adminApi.users()])
      .then(([statsRes, usersRes]) => {
        setStats(statsRes.stats)
        setUsers(usersRes.users)
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

  return (
    <div className="app-shell">
      <h1>Admin dashboard</h1>
      <p className="muted">Platform-wide stats and user management. Visible to admins only.</p>

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
        <h2 style={{ marginTop: 0 }}>Users</h2>
        {!users && !error && <p className="muted">Loading…</p>}
        {users && users.length === 0 && <p className="muted">No users yet.</p>}
        {users && users.length > 0 && (
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
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === "admin" ? "strong" : ""}`}>{u.role}</span>
                    </td>
                    <td>{u.emailVerified ? "Yes" : "No"}</td>
                    <td>{u.profileSaved ? "Saved" : "Empty"}</td>
                    <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyUserId === u.id}
                        onClick={() => toggleRole(u)}
                      >
                        {u.role === "admin" ? "Revoke admin" : "Make admin"}
                        {u.id === currentUser?.id ? " (you)" : ""}
                      </button>
                    </td>
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
