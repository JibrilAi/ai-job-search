import { Navigate } from "react-router-dom"
import type { ReactNode } from "react"
import { useAuth } from "../api/AuthContext.js"

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-shell muted">Loading…</div>
  if (!user || user.role !== "admin") return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
