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

type RoleFilter = "all" | "admin" | "user"

export default function AdminDashboard() {
  const { user: currentUser } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")

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

  const filteredUsers = (users ?? []).filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false
    if (search.trim() && !u.email.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  const adminCount = users?.filter((u) => u.role === "admin").length ?? 0
  const incompleteProfiles = users?.filter((u) => !u.profileSaved).length ?? 0

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0 }}>
            Users {users && <span className="muted">({filteredUsers.length} of {users.length})</span>}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="muted">{adminCount} admin{adminCount === 1 ? "" : "s"} · {incompleteProfiles} without a profile</span>
          </div>
        </div>

        <div className="form-grid" style={{ margin: "16px 0" }}>
          <div className="form-row">
            <label>Search by email</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. name@example.com" />
          </div>
          <div className="form-row">
            <label>Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
              <option value="all">All roles</option>
              <option value="admin">Admins only</option>
              <option value="user">Users only</option>
            </select>
          </div>
        </div>

        {!users && !error && <p className="muted">Loading…</p>}
        {users && users.length === 0 && <p className="muted">No users yet.</p>}
        {users && users.length > 0 && filteredUsers.length === 0 && (
          <p className="muted">No users match this filter.</p>
        )}
        {filteredUsers.length > 0 && (
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
