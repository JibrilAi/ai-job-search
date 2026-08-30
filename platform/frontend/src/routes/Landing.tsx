import { Link, Navigate } from "react-router-dom"
import { useAuth } from "../api/AuthContext.js"

const FEATURES = [
  {
    title: "Ranked job feed",
    body: "Every scraped posting is scored against your profile — skills, experience, location, and language gates — so you only see what's actually worth your time.",
  },
  {
    title: "Tailored CVs & cover letters",
    body: "Generate ATS-verified CVs and cover letters per application, built from your real profile — no fabricated claims, no generic boilerplate.",
  },
  {
    title: "Application tracker",
    body: "Track every application from drafted to offer, with status history, contacts, and notes in one place.",
  },
  {
    title: "AI-powered fit evaluation",
    body: "A structured evaluation of technical, experience, behavioral, and career fit for every job, with strengths and gaps called out explicitly.",
  },
]

export default function Landing() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/dashboard" replace />

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand">AI Job Search</span>
        <div className="landing-nav-links">
          <Link to="/login" className="landing-nav-link">
            Log in
          </Link>
          <Link to="/login" className="btn-primary">
            Get started
          </Link>
        </div>
      </header>

      <section className="hero">
        <h1>Find the roles worth applying to — and apply faster.</h1>
        <p className="hero-sub">
          One profile. Jobs scraped, ranked, and matched against your skills, experience, and behavioral fit. Tailored
          CVs and cover letters generated on demand, ATS-verified before they leave your hands.
        </p>
        <div className="hero-cta">
          <Link to="/login" className="btn-primary btn-large">
            Get started free
          </Link>
          <a href="#features" className="btn-secondary btn-large">
            See how it works
          </a>
        </div>
      </section>

      <section className="features" id="features">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="landing-footer">
        <span className="muted">Built for job seekers who'd rather apply than scroll.</span>
      </footer>
    </div>
  )
}
