import { NavLink, Route, Routes } from "react-router-dom"
import { AuthProvider, useAuth } from "./api/AuthContext.js"
import RequireAuth from "./components/RequireAuth.js"
import SignupLogin from "./routes/SignupLogin.js"
import AuthVerify from "./routes/AuthVerify.js"
import ProfileSetup from "./routes/ProfileSetup.js"
import JobFeed from "./routes/JobFeed.js"
import JobDetail from "./routes/JobDetail.js"
import Settings from "./routes/Settings.js"

function TopNav() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="top-nav">
      <span className="brand">AI Job Search</span>
      <div className="links">
        <NavLink to="/" end>
          Jobs
        </NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<SignupLogin />} />
      <Route path="/auth/verify" element={<AuthVerify />} />
      <Route
        path="/"
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
