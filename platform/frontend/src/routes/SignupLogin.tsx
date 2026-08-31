import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { authApi, ApiError } from "../api/client.js"
import { useAuth } from "../api/AuthContext.js"
import Turnstile, { type TurnstileHandle } from "../components/Turnstile.js"

type Mode = "login" | "signup" | "magic-link"

export default function SignupLogin() {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const { refresh } = useAuth()
  const navigate = useNavigate()

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setMagicLinkSentTo(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === "signup") {
        await authApi.signup(email, password, turnstileToken)
        await refresh()
        navigate("/profile")
      } else if (mode === "login") {
        await authApi.login(email, password, turnstileToken)
        await refresh()
        navigate("/dashboard")
      } else {
        await authApi.magicLink(email, turnstileToken)
        setMagicLinkSentTo(email)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      turnstileRef.current?.reset()
      setTurnstileToken(undefined)
    } finally {
      setSubmitting(false)
    }
  }

  if (magicLinkSentTo) {
    return (
      <div className="app-shell" style={{ maxWidth: 420, paddingTop: 80 }}>
        <div className="card auth-confirm">
          <div className="auth-confirm-icon">✓</div>
          <h1 style={{ marginTop: 0 }}>Check your inbox</h1>
          <p>
            We've sent a sign-in link to <strong>{magicLinkSentTo}</strong>. It always takes you to the one account
            tied to that email — signing you in if you already have one, or setting one up on the spot if you don't.
            It expires in 15 minutes.
          </p>
          <button type="button" className="secondary" onClick={() => switchMode("magic-link")}>
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>AI Job Search</h1>
        <div className="tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} type="button">
            Log in
          </button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")} type="button">
            Sign up
          </button>
          <button className={mode === "magic-link" ? "active" : ""} onClick={() => switchMode("magic-link")} type="button">
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
          <Turnstile ref={turnstileRef} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(undefined)} />
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : mode === "login"
                  ? "Log in"
                  : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  )
}
