import { useEffect, useState } from "react"
import { profileApi, ApiError, type ProfileInput } from "../api/client.js"

const EMPTY_PROFILE: ProfileInput = {
  name: "",
  city: "",
  country: "",
  commuteConstraints: "",
  cvLanguage: "English",
  employmentStatus: "",
  linkedinHeadline: "",
  languages: [],
  education: [],
  experience: [],
  skills: { primary: [], secondary: [], domain: [], software: [] },
  certifications: [],
  publications: [],
  awards: [],
  behavioral: { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" },
  motivation: { energizingTasks: [], drainingTasks: [] },
  targetSectors: [],
  dealbreakers: [],
  eligibility: { citizenshipOrPr: "", visaConstraintsNote: "" },
}

function csv(list: string[]): string {
  return list.join(", ")
}
function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function ProfileSetup() {
  const [profile, setProfile] = useState<ProfileInput>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    profileApi
      .get()
      .then(({ profile: existing }) => {
        if (existing) {
          const { userId: _u, profileVersion: _v, updatedAt: _a, ...rest } = existing
          setProfile(rest)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await profileApi.save(profile)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile.")
    } finally {
      setSaving(false)
    }
  }

  function addLanguage() {
    setProfile((p) => ({ ...p, languages: [...p.languages, { language: "", level: "" }] }))
  }

  function addExperience() {
    setProfile((p) => ({
      ...p,
      experience: [...p.experience, { title: "", company: "", location: "", bullets: [] }],
    }))
  }

  function addEducation() {
    setProfile((p) => ({
      ...p,
      education: [...p.education, { degree: "", field: "", institution: "" }],
    }))
  }

  if (loading) return <div className="app-shell">Loading…</div>

  return (
    <div className="app-shell">
      <h1>Your profile</h1>
      <p className="muted">This drives AI job matching -- the more complete it is, the better the ranking.</p>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3>Identity</h3>
          <div className="form-grid">
            <div className="form-row">
              <label>Name</label>
              <input value={profile.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div className="form-row">
              <label>LinkedIn headline</label>
              <input
                value={profile.linkedinHeadline ?? ""}
                onChange={(e) => setProfile({ ...profile, linkedinHeadline: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>City</label>
              <input value={profile.city ?? ""} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Country</label>
              <input value={profile.country ?? ""} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Commute constraints</label>
              <input
                value={profile.commuteConstraints ?? ""}
                onChange={(e) => setProfile({ ...profile, commuteConstraints: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Employment status</label>
              <input
                value={profile.employmentStatus ?? ""}
                onChange={(e) => setProfile({ ...profile, employmentStatus: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Citizenship / PR status</label>
              <input
                value={profile.eligibility.citizenshipOrPr ?? ""}
                onChange={(e) => setProfile({ ...profile, eligibility: { ...profile.eligibility, citizenshipOrPr: e.target.value } })}
              />
            </div>
            <div className="form-row">
              <label>Visa constraints (hours/start date), if any</label>
              <input
                value={profile.eligibility.visaConstraintsNote ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, eligibility: { ...profile.eligibility, visaConstraintsNote: e.target.value } })
                }
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Languages</h3>
          {profile.languages.map((lang, i) => (
            <div className="form-grid" key={i}>
              <div className="form-row">
                <label>Language</label>
                <input
                  value={lang.language}
                  onChange={(e) => {
                    const next = [...profile.languages]
                    next[i] = { ...next[i], language: e.target.value }
                    setProfile({ ...profile, languages: next })
                  }}
                />
              </div>
              <div className="form-row">
                <label>Level (e.g. C1, native, professional working proficiency)</label>
                <input
                  value={lang.level}
                  onChange={(e) => {
                    const next = [...profile.languages]
                    next[i] = { ...next[i], level: e.target.value }
                    setProfile({ ...profile, languages: next })
                  }}
                />
              </div>
            </div>
          ))}
          <button type="button" className="secondary" onClick={addLanguage}>
            + Add language
          </button>
        </div>

        <div className="card">
          <h3>Skills</h3>
          <div className="form-row">
            <label>Primary skills (comma-separated)</label>
            <input
              value={csv(profile.skills.primary)}
              onChange={(e) => setProfile({ ...profile, skills: { ...profile.skills, primary: fromCsv(e.target.value) } })}
            />
          </div>
          <div className="form-row">
            <label>Secondary skills (comma-separated)</label>
            <input
              value={csv(profile.skills.secondary)}
              onChange={(e) => setProfile({ ...profile, skills: { ...profile.skills, secondary: fromCsv(e.target.value) } })}
            />
          </div>
          <div className="form-row">
            <label>Domain expertise (comma-separated)</label>
            <input
              value={csv(profile.skills.domain)}
              onChange={(e) => setProfile({ ...profile, skills: { ...profile.skills, domain: fromCsv(e.target.value) } })}
            />
          </div>
        </div>

        <div className="card">
          <h3>Experience</h3>
          {profile.experience.map((exp, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <div className="form-grid">
                <div className="form-row">
                  <label>Title</label>
                  <input
                    value={exp.title}
                    onChange={(e) => {
                      const next = [...profile.experience]
                      next[i] = { ...next[i], title: e.target.value }
                      setProfile({ ...profile, experience: next })
                    }}
                  />
                </div>
                <div className="form-row">
                  <label>Company</label>
                  <input
                    value={exp.company}
                    onChange={(e) => {
                      const next = [...profile.experience]
                      next[i] = { ...next[i], company: e.target.value }
                      setProfile({ ...profile, experience: next })
                    }}
                  />
                </div>
              </div>
              <div className="form-row">
                <label>Key bullets (comma-separated)</label>
                <textarea
                  value={csv(exp.bullets)}
                  onChange={(e) => {
                    const next = [...profile.experience]
                    next[i] = { ...next[i], bullets: fromCsv(e.target.value) }
                    setProfile({ ...profile, experience: next })
                  }}
                />
              </div>
            </div>
          ))}
          <button type="button" className="secondary" onClick={addExperience}>
            + Add experience
          </button>
        </div>

        <div className="card">
          <h3>Education</h3>
          {profile.education.map((ed, i) => (
            <div className="form-grid" key={i}>
              <div className="form-row">
                <label>Degree</label>
                <input
                  value={ed.degree}
                  onChange={(e) => {
                    const next = [...profile.education]
                    next[i] = { ...next[i], degree: e.target.value }
                    setProfile({ ...profile, education: next })
                  }}
                />
              </div>
              <div className="form-row">
                <label>Field</label>
                <input
                  value={ed.field}
                  onChange={(e) => {
                    const next = [...profile.education]
                    next[i] = { ...next[i], field: e.target.value }
                    setProfile({ ...profile, education: next })
                  }}
                />
              </div>
              <div className="form-row">
                <label>Institution</label>
                <input
                  value={ed.institution}
                  onChange={(e) => {
                    const next = [...profile.education]
                    next[i] = { ...next[i], institution: e.target.value }
                    setProfile({ ...profile, education: next })
                  }}
                />
              </div>
            </div>
          ))}
          <button type="button" className="secondary" onClick={addEducation}>
            + Add education
          </button>
        </div>

        <div className="card">
          <h3>Behavioral profile</h3>
          <div className="form-row">
            <label>Traits (comma-separated)</label>
            <input
              value={csv(profile.behavioral.traits)}
              onChange={(e) => setProfile({ ...profile, behavioral: { ...profile.behavioral, traits: fromCsv(e.target.value) } })}
            />
          </div>
          <div className="form-row">
            <label>Strengths</label>
            <textarea
              value={profile.behavioral.strengths}
              onChange={(e) => setProfile({ ...profile, behavioral: { ...profile.behavioral, strengths: e.target.value } })}
            />
          </div>
          <div className="form-row">
            <label>Thrives in</label>
            <textarea
              value={profile.behavioral.idealEnvironment}
              onChange={(e) =>
                setProfile({ ...profile, behavioral: { ...profile.behavioral, idealEnvironment: e.target.value } })
              }
            />
          </div>
        </div>

        <div className="card">
          <h3>Career &amp; motivation</h3>
          <div className="form-row">
            <label>Target sectors (comma-separated)</label>
            <input
              value={csv(profile.targetSectors)}
              onChange={(e) => setProfile({ ...profile, targetSectors: fromCsv(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Energizing tasks (comma-separated)</label>
            <input
              value={csv(profile.motivation.energizingTasks)}
              onChange={(e) =>
                setProfile({ ...profile, motivation: { ...profile.motivation, energizingTasks: fromCsv(e.target.value) } })
              }
            />
          </div>
          <div className="form-row">
            <label>Draining tasks (comma-separated)</label>
            <input
              value={csv(profile.motivation.drainingTasks)}
              onChange={(e) =>
                setProfile({ ...profile, motivation: { ...profile.motivation, drainingTasks: fromCsv(e.target.value) } })
              }
            />
          </div>
          <div className="form-row">
            <label>Deal-breakers (comma-separated)</label>
            <input
              value={csv(profile.dealbreakers)}
              onChange={(e) => setProfile({ ...profile, dealbreakers: fromCsv(e.target.value) })}
            />
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {saved && <p style={{ color: "var(--good)" }}>Profile saved.</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  )
}
