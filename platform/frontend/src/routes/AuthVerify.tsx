import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { authApi, ApiError } from "../api/client.js"
import { useAuth } from "../api/AuthContext.js"

export default function AuthVerify() {
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const { refresh } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const token = params.get("token")
    if (!token) {
      setError("Missing sign-in token.")
      return
    }
    authApi
      .verify(token)
      .then(async () => {
        await refresh()
        navigate("/")
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "This sign-in link is invalid or expired."))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app-shell" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="card">
        {error ? (
          <>
            <p className="error-text">{error}</p>
            <a href="/login">Back to sign in</a>
          </>
        ) : (
          <p className="muted">Signing you in…</p>
        )}
      </div>
    </div>
  )
}
