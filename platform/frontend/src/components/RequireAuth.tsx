import { Navigate } from "react-router-dom"
import type { ReactNode } from "react"
import { useAuth } from "../api/AuthContext.js"

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-shell muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
