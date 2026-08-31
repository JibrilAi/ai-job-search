import { Link } from "react-router-dom"
import { useAuth } from "../api/AuthContext.js"

export default function NotFound() {
  const { user } = useAuth()
  return (
    <div className="app-shell" style={{ textAlign: "center", paddingTop: 80 }}>
      <div className="hero-kicker">404</div>
      <h1>Page not found</h1>
      <p className="muted" style={{ margin: "0 auto 28px", maxWidth: 420 }}>
        That page doesn't exist, or you may have followed a stale link.
      </p>
      <Link to={user ? "/dashboard" : "/"} className="btn-primary">
        {user ? "Back to dashboard" : "Back to home"}
      </Link>
    </div>
  )
}
