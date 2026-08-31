import { useEffect, useState } from "react"
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom"
import { AuthProvider, useAuth } from "./api/AuthContext.js"
import RequireAuth from "./components/RequireAuth.js"
import RequireAdmin from "./components/RequireAdmin.js"
import Landing from "./routes/Landing.js"
import SignupLogin from "./routes/SignupLogin.js"
import AuthVerify from "./routes/AuthVerify.js"
import ProfileSetup from "./routes/ProfileSetup.js"
import JobFeed from "./routes/JobFeed.js"
import JobDetail from "./routes/JobDetail.js"
import DocumentStudio from "./routes/DocumentStudio.js"
import ApplicationTracker from "./routes/ApplicationTracker.js"
import Settings from "./routes/Settings.js"
import AdminDashboard from "./routes/admin/AdminDashboard.js"
import NotFound from "./routes/NotFound.js"

const NAV_LINKS = [
  { to: "/dashboard", label: "Jobs", end: true },
  { to: "/applications", label: "Applications" },
  { to: "/documents", label: "Documents" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
]

function TopNav() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Close the mobile menu automatically whenever the route changes, so it
  // never stays open covering the next page after a link is followed.
  useEffect(() => setMenuOpen(false), [location.pathname])

  if (!user) return null

  return (
    <div className="top-nav">
      <div className="top-nav-bar">
        <Link to="/dashboard" className="brand">
          AI Job Search
        </Link>
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      <nav className={`links ${menuOpen ? "open" : ""}`}>
        {NAV_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            {link.label}
          </NavLink>
        ))}
        {user.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
      </nav>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<SignupLogin />} />
      <Route path="/auth/verify" element={<AuthVerify />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <JobFeed />
          </RequireAuth>
        }
      />
      <Route
        path="/jobs/:id"
        element={
          <RequireAuth>
            <JobDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/applications"
        element={
          <RequireAuth>
            <ApplicationTracker />
          </RequireAuth>
        }
      />
      <Route
        path="/documents"
        element={
          <RequireAuth>
            <DocumentStudio />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfileSetup />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Settings />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TopNav />
      <AppRoutes />
    </AuthProvider>
  )
}
