import { Link, Navigate } from "react-router-dom"
import { useAuth } from "../api/AuthContext.js"

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  feed: "M4 6h16M4 12h10M4 18h6",
  docs: "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6",
  tracker: "M4 5h16v4H4zM4 15h16v4H4zM4 5v14M20 5v14",
  fit: "M12 2a10 10 0 1 0 0.001 0zM12 6a6 6 0 1 0 0.001 0zM12 10a2 2 0 1 0 0.001 0z",
}

const FEATURES = [
  {
    icon: ICONS.feed,
    title: "Ranked job feed",
    body: "Every scraped posting is scored against your profile — skills, experience, location, and language gates — so you only see what's actually worth your time.",
  },
  {
    icon: ICONS.docs,
    title: "Tailored CVs & cover letters",
    body: "Generate ATS-verified CVs and cover letters per application, built from your real profile — no fabricated claims, no generic boilerplate.",
  },
  {
    icon: ICONS.tracker,
    title: "Application tracker",
    body: "Track every application from drafted to offer, with status history, contacts, and notes in one place.",
  },
  {
    icon: ICONS.fit,
    title: "AI-powered fit evaluation",
    body: "A structured evaluation of technical, experience, behavioral, and career fit for every job, with strengths and gaps called out explicitly.",
  },
]

const STEPS = [
  {
    number: "1",
    title: "Build your profile",
    body: "Fill in your skills, experience, and preferences once — or upload a resume and let AI prefill it for you.",
  },
  {
    number: "2",
    title: "Get a ranked feed",
    body: "New postings are scraped on a schedule and scored against your profile automatically. No searching required.",
  },
  {
    number: "3",
    title: "Apply with confidence",
    body: "Generate a tailored, ATS-verified CV and cover letter per job, then track the application through to an offer.",
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
        <span className="hero-kicker">Job search, run by your profile</span>
        <h1>Find the roles worth applying to — and apply faster.</h1>
        <p className="hero-sub">
          One profile. Jobs scraped, ranked, and matched against your skills, experience, and behavioral fit. Tailored
          CVs and cover letters generated on demand, ATS-verified before they leave your hands.
        </p>
        <div className="hero-cta">
          <Link to="/login" className="btn-primary btn-large">
            Get started free
          </Link>
          <a href="#how-it-works" className="btn-secondary btn-large">
            See how it works
          </a>
        </div>
      </section>

      <section className="steps" id="how-it-works">
        {STEPS.map((s) => (
          <div className="step-card" key={s.number}>
            <div className="step-number">{s.number}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </section>

      <section className="features" id="features">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="feature-icon">
              <Icon path={f.icon} />
            </div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="cta-banner">
        <h2>Stop scrolling job boards. Start applying.</h2>
        <p className="muted">Free to start — build your profile in a few minutes.</p>
        <Link to="/login" className="btn-primary btn-large">
          Get started free
        </Link>
      </section>

      <footer className="landing-footer">
        <span className="muted">Built for job seekers who'd rather apply than scroll.</span>
      </footer>
    </div>
  )
}
