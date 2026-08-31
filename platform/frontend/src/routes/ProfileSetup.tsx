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

// Fills gaps in the current form from an AI-extracted resume without
// clobbering fields the user already typed in -- a field only wins if the
// current value is empty and the extracted one isn't.
function mergeProfile(current: ProfileInput, incoming: ProfileInput): ProfileInput {
  const str = (a: string | null, b: string | null) => a || b
  const arr = <T,>(a: T[], b: T[]) => (a.length ? a : b)
  return {
    name: str(current.name, incoming.name),
    city: str(current.city, incoming.city),
    country: str(current.country, incoming.country),
    commuteConstraints: str(current.commuteConstraints, incoming.commuteConstraints),
    cvLanguage: str(current.cvLanguage, incoming.cvLanguage),
    employmentStatus: str(current.employmentStatus, incoming.employmentStatus),
    linkedinHeadline: str(current.linkedinHeadline, incoming.linkedinHeadline),
    languages: arr(current.languages, incoming.languages),
    education: arr(current.education, incoming.education),
    experience: arr(current.experience, incoming.experience),
    skills: {
      primary: arr(current.skills.primary, incoming.skills.primary),
      secondary: arr(current.skills.secondary, incoming.skills.secondary),
      domain: arr(current.skills.domain, incoming.skills.domain),
      software: arr(current.skills.software, incoming.skills.software),
    },
    certifications: arr(current.certifications, incoming.certifications),
    publications: arr(current.publications, incoming.publications),
    awards: arr(current.awards, incoming.awards),
    behavioral: {
      traits: arr(current.behavioral.traits, incoming.behavioral.traits),
      strengths: current.behavioral.strengths || incoming.behavioral.strengths,
      growthAreas: current.behavioral.growthAreas || incoming.behavioral.growthAreas,
      idealEnvironment: current.behavioral.idealEnvironment || incoming.behavioral.idealEnvironment,
    },
    motivation: {
      energizingTasks: arr(current.motivation.energizingTasks, incoming.motivation.energizingTasks),
      drainingTasks: arr(current.motivation.drainingTasks, incoming.motivation.drainingTasks),
    },
    targetSectors: arr(current.targetSectors, incoming.targetSectors),
    dealbreakers: arr(current.dealbreakers, incoming.dealbreakers),
    eligibility: {
      citizenshipOrPr: str(current.eligibility.citizenshipOrPr, incoming.eligibility.citizenshipOrPr),
      visaConstraintsNote: str(current.eligibility.visaConstraintsNote, incoming.eligibility.visaConstraintsNote),
    },
  }
}

export default function ProfileSetup() {
  const [profile, setProfile] = useState<ProfileInput>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [searchLocation, setSearchLocation] = useState("")
  const [searchSuggestion, setSearchSuggestion] = useState<{ query: string; location: string | null } | null>(null)
  const [searchSaving, setSearchSaving] = useState(false)
  const [searchSaved, setSearchSaved] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  function loadSearchPreferences() {
    profileApi.searchPreferences().then(({ suggestion, saved: savedPrefs }) => {
      setSearchSuggestion(suggestion)
      setSearchQuery(savedPrefs?.query ?? suggestion.query)
      setSearchLocation(savedPrefs?.location ?? suggestion.location ?? "")
    })
  }

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
    loadSearchPreferences()
  }, [])

  async function handleSaveSearchPreferences() {
    setSearchSaving(true)
    setSearchError(null)
    setSearchSaved(false)
    try {
      await profileApi.saveSearchPreferences(searchQuery.trim(), searchLocation.trim() || null)
      setSearchSaved(true)
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Could not save your search preferences.")
    } finally {
      setSearchSaving(false)
    }
  }

  function resetSearchToSuggestion() {
    if (!searchSuggestion) return
    setSearchQuery(searchSuggestion.query)
    setSearchLocation(searchSuggestion.location ?? "")
  }

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

  async function handleResumeImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      const { profile: extracted } = await profileApi.importResume(file)
      setProfile((current) => mergeProfile(current, extracted))
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Could not import that resume.")
    } finally {
      setImporting(false)
    }
  }

  if (loading) return <div className="app-shell">Loading…</div>

  return (
    <div className="app-shell">
      <h1>Your profile</h1>
      <p className="muted">This drives AI job matching -- the more complete it is, the better the ranking.</p>

      <div className="card">
        <h3>Import from resume</h3>
        <p className="muted">
          Upload a PDF resume to prefill the form below with AI-extracted details. It only fills in blank fields --
          anything you've already typed is kept. Review everything before saving.
        </p>
        <input type="file" accept="application/pdf" disabled={importing} onChange={handleResumeImport} />
        {importing && <p className="muted">Reading your resume…</p>}
        {importError && <p className="error-text">{importError}</p>}
      </div>

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
          <div className="form-row">
            <label>Software / tools (comma-separated)</label>
            <input
              value={csv(profile.skills.software)}
              onChange={(e) => setProfile({ ...profile, skills: { ...profile.skills, software: fromCsv(e.target.value) } })}
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
          <h3>Credentials</h3>
          <div className="form-row">
            <label>Certifications (comma-separated)</label>
            <input
              value={csv(profile.certifications)}
              onChange={(e) => setProfile({ ...profile, certifications: fromCsv(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Publications (comma-separated)</label>
            <input
              value={csv(profile.publications)}
              onChange={(e) => setProfile({ ...profile, publications: fromCsv(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Awards (comma-separated)</label>
            <input
              value={csv(profile.awards)}
              onChange={(e) => setProfile({ ...profile, awards: fromCsv(e.target.value) })}
            />
          </div>
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
            <label>Growth areas</label>
            <textarea
              value={profile.behavioral.growthAreas}
              onChange={(e) => setProfile({ ...profile, behavioral: { ...profile.behavioral, growthAreas: e.target.value } })}
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

      <div className="card">
        <h3>Search preferences</h3>
        <p className="muted">
          Suggested from your skills, domain expertise, and target sectors -- edit before saving. Without this, the
          shared job pool only reflects a couple of broad, untargeted default searches, which may have little to do
          with your actual field.
        </p>
        <div className="form-row">
          <label>Search keywords</label>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="e.g. Entrepreneurship, Aviation, Finance" />
        </div>
        <div className="form-row">
          <label>Location (blank searches everywhere)</label>
          <input value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)} placeholder="e.g. Toronto, Ontario, Canada" />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={handleSaveSearchPreferences} disabled={searchSaving}>
            {searchSaving ? "Saving…" : "Save search preferences"}
          </button>
          {searchSuggestion && (
            <button type="button" className="secondary" onClick={resetSearchToSuggestion}>
              Reset to suggestion
            </button>
          )}
        </div>
        {searchError && <p className="error-text">{searchError}</p>}
        {searchSaved && <p style={{ color: "var(--good)" }}>Search preferences saved.</p>}
      </div>
    </div>
  )
}
