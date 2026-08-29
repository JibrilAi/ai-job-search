import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { authApi, ApiError } from "../api/client.js"
import { useAuth } from "../api/AuthContext.js"

type Mode = "login" | "signup" | "magic-link"

export default function SignupLogin() {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { refresh } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      if (mode === "signup") {
        await authApi.signup(email, password)
        await refresh()
        navigate("/profile")
      } else if (mode === "login") {
        await authApi.login(email, password)
        await refresh()
        navigate("/")
      } else {
        await authApi.magicLink(email)
        setInfo("If that email is registered, a sign-in link is on its way. Check your inbox.")
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>AI Job Search</h1>
        <div className="tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
            Log in
          </button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} type="button">
            Sign up
          </button>
          <button className={mode === "magic-link" ? "active" : ""} onClick={() => setMode("magic-link")} type="button">
            Magic link
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "magic-link" && (
            <div className="form-row">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
          {info && <p className="muted">{info}</p>}
          <button type="submit" disabled={submitting}>
            {mode === "signup" ? "Create account" : mode === "login" ? "Log in" : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  )
}
