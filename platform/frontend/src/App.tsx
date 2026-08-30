import { NavLink, Route, Routes } from "react-router-dom"
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

function TopNav() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="top-nav">
      <span className="brand">AI Job Search</span>
      <div className="links">
        <NavLink to="/dashboard" end>
          Jobs
        </NavLink>
        <NavLink to="/applications">Applications</NavLink>
        <NavLink to="/documents">Documents</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        {user.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
      </div>
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
