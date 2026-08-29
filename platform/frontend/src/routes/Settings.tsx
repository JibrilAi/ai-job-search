import { useNavigate } from "react-router-dom"
import { useAuth } from "../api/AuthContext.js"

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate("/login")
  }

  return (
    <div className="app-shell">
      <h1>Settings</h1>
      <div className="card">
        <p>
          Signed in as <strong>{user?.email}</strong>
        </p>
        <button className="secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  )
}
