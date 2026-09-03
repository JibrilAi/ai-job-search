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
  noticePeriod: "",
  salaryExpectation: "",
  relocationWillingness: "",
  workArrangementPreference: "",
  portfolioUrl: "",
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
  autoApplyEnabled: false,
  autoSubmitMode: "off",
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
    noticePeriod: str(current.noticePeriod, incoming.noticePeriod),
    salaryExpectation: str(current.salaryExpectation, incoming.salaryExpectation),
    relocationWillingness: str(current.relocationWillingness, incoming.relocationWillingness),
    workArrangementPreference: str(current.workArrangementPreference, incoming.workArrangementPreference),
    portfolioUrl: str(current.portfolioUrl, incoming.portfolioUrl),
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
    // A resume PDF has no opinion on these settings -- always keep whatever
    // the form already has, never take the extraction's placeholder value.
    autoApplyEnabled: current.autoApplyEnabled,
    autoSubmitMode: current.autoSubmitMode,
  }
}

// Small icon button next to a field label that asks the backend to suggest
// a value for just that one field (grounded in the rest of the in-memory
// profile), which the caller then applies into form state -- the user
// reviews/edits it like any other typed value before saving.
function AiSuggest({
  label,
  fieldType,
  currentValue,
  profile,
  onApply,
}: {
  label: string
  fieldType: "string" | "string[]"
  currentValue: string | string[]
  profile: ProfileInput
  onApply: (value: string | string[]) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const { value } = await profileApi.suggestField(label, fieldType, currentValue, profile)
      // The AI can legitimately have nothing to go on yet (e.g. early in
      // profile setup, before enough of the rest of the profile is
      // filled in) -- applying an empty result would silently wipe out
      // whatever the user already typed here, which reads as "the button
      // stopped working" rather than the honest "no suggestion yet."
      const isEmpty = Array.isArray(value) ? value.length === 0 : value === ""
      if (isEmpty) {
        setError("Not enough profile info yet for a suggestion here -- try filling in more fields first.")
      } else {
        onApply(value)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI suggestion failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        className="ai-suggest-btn"
        title={`AI-suggest: ${label}`}
        aria-label={`AI-suggest ${label}`}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? <span className="spinner" aria-hidden="true" /> : "✨"}
      </button>
      {error && (
        <span className="error-text ai-suggest-error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}

export default function ProfileSetup() {
  const [profile, setProfile] = useState<ProfileInput>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [resumeFile, setResumeFile] = useState<File | null>(null)

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
      // The search-preferences suggestion is derived server-side from the
      // saved profile's skills/domain/target sectors -- refresh it now that
      // there's a saved profile to derive it from (it stays empty otherwise,
      // e.g. right after a resume import that hasn't been saved yet).
      loadSearchPreferences()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile.")
    } finally {
      setSaving(false)
    }
  }

  function addLanguage() {
    setProfile((p) => ({ ...p, languages: [...p.languages, { language: "", level: "" }] }))
  }
  function updateLanguage(i: number, patch: Partial<ProfileInput["languages"][number]>) {
    const next = [...profile.languages]
    next[i] = { ...next[i], ...patch }
    setProfile({ ...profile, languages: next })
  }
  function removeLanguage(i: number) {
    setProfile((p) => ({ ...p, languages: p.languages.filter((_, idx) => idx !== i) }))
  }

  function addExperience() {
    setProfile((p) => ({
      ...p,
      experience: [...p.experience, { title: "", company: "", location: "", bullets: [] }],
    }))
  }
  function updateExperience(i: number, patch: Partial<ProfileInput["experience"][number]>) {
    const next = [...profile.experience]
    next[i] = { ...next[i], ...patch }
    setProfile({ ...profile, experience: next })
  }
  function removeExperience(i: number) {
    setProfile((p) => ({ ...p, experience: p.experience.filter((_, idx) => idx !== i) }))
  }

  function addEducation() {
    setProfile((p) => ({
      ...p,
      education: [...p.education, { degree: "", field: "", institution: "" }],
    }))
  }
  function updateEducation(i: number, patch: Partial<ProfileInput["education"][number]>) {
    const next = [...profile.education]
    next[i] = { ...next[i], ...patch }
    setProfile({ ...profile, education: next })
  }
  function removeEducation(i: number) {
    setProfile((p) => ({ ...p, education: p.education.filter((_, idx) => idx !== i) }))
  }

  async function runResumeImport(file: File) {
    setImporting(true)
    setImportError(null)
    try {
      const { profile: extracted } = await profileApi.importResume(file)
      setProfile((current) => mergeProfile(current, extracted))
      setResumeFile(null)
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Could not import that resume.")
    } finally {
      setImporting(false)
    }
  }

  function handleResumeImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setResumeFile(file)
    runResumeImport(file)
  }

  function handleResumeRetry() {
    if (resumeFile) runResumeImport(resumeFile)
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
          anything you've already typed is kept. Review everything before saving. Every field below also has its own
          ✨ button if you'd rather have AI suggest just that one, based on the rest of what you've filled in.
        </p>
        <input type="file" accept="application/pdf" disabled={importing} onChange={handleResumeImport} />
        {importing && (
          <p className="muted inline-status">
            <span className="spinner" aria-hidden="true" />
            Reading your resume…
          </p>
        )}
        {importError && !importing && (
          <div className="inline-status">
            <p className="error-text" style={{ margin: 0 }}>
              {importError}
            </p>
            {resumeFile && (
              <button type="button" className="secondary" onClick={handleResumeRetry}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3>Identity</h3>
          <div className="form-grid">
            <div className="form-row">
              <div className="field-label-row">
                <label>Name</label>
                <AiSuggest
                  label="Name"
                  fieldType="string"
                  currentValue={profile.name ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, name: v as string })}
                />
              </div>
              <input value={profile.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>LinkedIn headline</label>
                <AiSuggest
                  label="LinkedIn headline"
                  fieldType="string"
                  currentValue={profile.linkedinHeadline ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, linkedinHeadline: v as string })}
                />
              </div>
              <input
                value={profile.linkedinHeadline ?? ""}
                onChange={(e) => setProfile({ ...profile, linkedinHeadline: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>CV language</label>
                <AiSuggest
                  label="CV language"
                  fieldType="string"
                  currentValue={profile.cvLanguage ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, cvLanguage: v as string })}
                />
              </div>
              <input value={profile.cvLanguage ?? ""} onChange={(e) => setProfile({ ...profile, cvLanguage: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>City</label>
                <AiSuggest
                  label="City"
                  fieldType="string"
                  currentValue={profile.city ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, city: v as string })}
                />
              </div>
              <input value={profile.city ?? ""} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Country</label>
                <AiSuggest
                  label="Country"
                  fieldType="string"
                  currentValue={profile.country ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, country: v as string })}
                />
              </div>
              <input value={profile.country ?? ""} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Commute constraints</label>
                <AiSuggest
                  label="Commute constraints"
                  fieldType="string"
                  currentValue={profile.commuteConstraints ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, commuteConstraints: v as string })}
                />
              </div>
              <input
                value={profile.commuteConstraints ?? ""}
                onChange={(e) => setProfile({ ...profile, commuteConstraints: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Employment status</label>
                <AiSuggest
                  label="Employment status"
                  fieldType="string"
                  currentValue={profile.employmentStatus ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, employmentStatus: v as string })}
                />
              </div>
              <input
                value={profile.employmentStatus ?? ""}
                onChange={(e) => setProfile({ ...profile, employmentStatus: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Citizenship / PR status</label>
                <AiSuggest
                  label="Citizenship / PR status"
                  fieldType="string"
                  currentValue={profile.eligibility.citizenshipOrPr ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, eligibility: { ...profile.eligibility, citizenshipOrPr: v as string } })}
                />
              </div>
              <input
                value={profile.eligibility.citizenshipOrPr ?? ""}
                onChange={(e) => setProfile({ ...profile, eligibility: { ...profile.eligibility, citizenshipOrPr: e.target.value } })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Visa constraints (hours/start date), if any</label>
                <AiSuggest
                  label="Visa constraints (hours/start date), if any"
                  fieldType="string"
                  currentValue={profile.eligibility.visaConstraintsNote ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, eligibility: { ...profile.eligibility, visaConstraintsNote: v as string } })}
                />
              </div>
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
          <h3>Application preferences</h3>
          <p className="muted">
            Common screener questions real job applications ask (LinkedIn, Indeed, Greenhouse, Lever, Workday) --
            filling these in lets AI-suggest and the auto-submit engine answer them for you.
          </p>
          <div className="form-grid">
            <div className="form-row">
              <div className="field-label-row">
                <label>Notice period / earliest start date</label>
                <AiSuggest
                  label="Notice period / earliest start date"
                  fieldType="string"
                  currentValue={profile.noticePeriod ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, noticePeriod: v as string })}
                />
              </div>
              <input
                placeholder="e.g. 2 weeks, Immediately available"
                value={profile.noticePeriod ?? ""}
                onChange={(e) => setProfile({ ...profile, noticePeriod: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Salary expectation</label>
                <AiSuggest
                  label="Salary expectation"
                  fieldType="string"
                  currentValue={profile.salaryExpectation ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, salaryExpectation: v as string })}
                />
              </div>
              <input
                placeholder="e.g. $120,000-$140,000 CAD"
                value={profile.salaryExpectation ?? ""}
                onChange={(e) => setProfile({ ...profile, salaryExpectation: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Willingness to relocate</label>
                <AiSuggest
                  label="Willingness to relocate"
                  fieldType="string"
                  currentValue={profile.relocationWillingness ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, relocationWillingness: v as string })}
                />
              </div>
              <input
                placeholder="e.g. Open to relocating within Canada"
                value={profile.relocationWillingness ?? ""}
                onChange={(e) => setProfile({ ...profile, relocationWillingness: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Remote / hybrid / onsite preference</label>
                <AiSuggest
                  label="Remote / hybrid / onsite preference"
                  fieldType="string"
                  currentValue={profile.workArrangementPreference ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, workArrangementPreference: v as string })}
                />
              </div>
              <input
                placeholder="e.g. Remote preferred, open to hybrid"
                value={profile.workArrangementPreference ?? ""}
                onChange={(e) => setProfile({ ...profile, workArrangementPreference: e.target.value })}
              />
            </div>
            <div className="form-row">
              <div className="field-label-row">
                <label>Portfolio / GitHub / personal website</label>
                <AiSuggest
                  label="Portfolio / GitHub / personal website"
                  fieldType="string"
                  currentValue={profile.portfolioUrl ?? ""}
                  profile={profile}
                  onApply={(v) => setProfile({ ...profile, portfolioUrl: v as string })}
                />
              </div>
              <input value={profile.portfolioUrl ?? ""} onChange={(e) => setProfile({ ...profile, portfolioUrl: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Languages</h3>
          {profile.languages.map((lang, i) => (
            <div className="form-grid" key={i}>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Language</label>
                  <AiSuggest
                    label={`Language ${i + 1}: language name`}
                    fieldType="string"
                    currentValue={lang.language}
                    profile={profile}
                    onApply={(v) => updateLanguage(i, { language: v as string })}
                  />
                </div>
                <input value={lang.language} onChange={(e) => updateLanguage(i, { language: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Level (e.g. C1, native, professional working proficiency)</label>
                  <AiSuggest
                    label={`Language ${i + 1}: proficiency level`}
                    fieldType="string"
                    currentValue={lang.level}
                    profile={profile}
                    onApply={(v) => updateLanguage(i, { level: v as string })}
                  />
                </div>
                <input value={lang.level} onChange={(e) => updateLanguage(i, { level: e.target.value })} />
              </div>
              <button type="button" className="secondary" onClick={() => removeLanguage(i)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="secondary" onClick={addLanguage}>
            + Add language
          </button>
        </div>

        <div className="card">
          <h3>Skills</h3>
          <div className="form-row">
            <div className="field-label-row">
              <label>Primary skills (comma-separated)</label>
              <AiSuggest
                label="Primary skills"
                fieldType="string[]"
                currentValue={profile.skills.primary}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, skills: { ...profile.skills, primary: v as string[] } })}
              />
            </div>
            <input
              value={csv(profile.skills.primary)}
              onChange={(e) => setProfile({ ...profile, skills: { ...profile.skills, primary: fromCsv(e.target.value) } })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Secondary skills (comma-separated)</label>
              <AiSuggest
                label="Secondary skills"
                fieldType="string[]"
                currentValue={profile.skills.secondary}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, skills: { ...profile.skills, secondary: v as string[] } })}
              />
            </div>
            <input
              value={csv(profile.skills.secondary)}
              onChange={(e) => setProfile({ ...profile, skills: { ...profile.skills, secondary: fromCsv(e.target.value) } })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Domain expertise (comma-separated)</label>
              <AiSuggest
                label="Domain expertise"
                fieldType="string[]"
                currentValue={profile.skills.domain}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, skills: { ...profile.skills, domain: v as string[] } })}
              />
            </div>
            <input
              value={csv(profile.skills.domain)}
              onChange={(e) => setProfile({ ...profile, skills: { ...profile.skills, domain: fromCsv(e.target.value) } })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Software / tools (comma-separated)</label>
              <AiSuggest
                label="Software / tools"
                fieldType="string[]"
                currentValue={profile.skills.software}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, skills: { ...profile.skills, software: v as string[] } })}
              />
            </div>
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
                  <div className="field-label-row">
                    <label>Title</label>
                    <AiSuggest
                      label={`Experience ${i + 1}: job title`}
                      fieldType="string"
                      currentValue={exp.title}
                      profile={profile}
                      onApply={(v) => updateExperience(i, { title: v as string })}
                    />
                  </div>
                  <input value={exp.title} onChange={(e) => updateExperience(i, { title: e.target.value })} />
                </div>
                <div className="form-row">
                  <div className="field-label-row">
                    <label>Company</label>
                    <AiSuggest
                      label={`Experience ${i + 1}: company`}
                      fieldType="string"
                      currentValue={exp.company}
                      profile={profile}
                      onApply={(v) => updateExperience(i, { company: v as string })}
                    />
                  </div>
                  <input value={exp.company} onChange={(e) => updateExperience(i, { company: e.target.value })} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-row">
                  <div className="field-label-row">
                    <label>Start date</label>
                    <AiSuggest
                      label={`Experience ${i + 1} (${exp.title || "untitled"}): start date`}
                      fieldType="string"
                      currentValue={exp.startDate ?? ""}
                      profile={profile}
                      onApply={(v) => updateExperience(i, { startDate: v as string })}
                    />
                  </div>
                  <input
                    placeholder="e.g. Jan 2022"
                    value={exp.startDate ?? ""}
                    onChange={(e) => updateExperience(i, { startDate: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <div className="field-label-row">
                    <label>End date</label>
                    <AiSuggest
                      label={`Experience ${i + 1} (${exp.title || "untitled"}): end date`}
                      fieldType="string"
                      currentValue={exp.endDate ?? ""}
                      profile={profile}
                      onApply={(v) => updateExperience(i, { endDate: v as string })}
                    />
                  </div>
                  <input
                    placeholder="e.g. Present"
                    value={exp.endDate ?? ""}
                    onChange={(e) => updateExperience(i, { endDate: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <div className="field-label-row">
                    <label>Location</label>
                    <AiSuggest
                      label={`Experience ${i + 1} (${exp.title || "untitled"}): location`}
                      fieldType="string"
                      currentValue={exp.location ?? ""}
                      profile={profile}
                      onApply={(v) => updateExperience(i, { location: v as string })}
                    />
                  </div>
                  <input value={exp.location ?? ""} onChange={(e) => updateExperience(i, { location: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Key bullets (comma-separated)</label>
                  <AiSuggest
                    label={`Experience ${i + 1} (${exp.title || "untitled"}): key bullets`}
                    fieldType="string[]"
                    currentValue={exp.bullets}
                    profile={profile}
                    onApply={(v) => updateExperience(i, { bullets: v as string[] })}
                  />
                </div>
                <textarea value={csv(exp.bullets)} onChange={(e) => updateExperience(i, { bullets: fromCsv(e.target.value) })} />
              </div>
              <button type="button" className="secondary" onClick={() => removeExperience(i)}>
                Remove
              </button>
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
                <div className="field-label-row">
                  <label>Degree</label>
                  <AiSuggest
                    label={`Education ${i + 1}: degree`}
                    fieldType="string"
                    currentValue={ed.degree}
                    profile={profile}
                    onApply={(v) => updateEducation(i, { degree: v as string })}
                  />
                </div>
                <input value={ed.degree} onChange={(e) => updateEducation(i, { degree: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Field</label>
                  <AiSuggest
                    label={`Education ${i + 1}: field of study`}
                    fieldType="string"
                    currentValue={ed.field}
                    profile={profile}
                    onApply={(v) => updateEducation(i, { field: v as string })}
                  />
                </div>
                <input value={ed.field} onChange={(e) => updateEducation(i, { field: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Institution</label>
                  <AiSuggest
                    label={`Education ${i + 1}: institution`}
                    fieldType="string"
                    currentValue={ed.institution}
                    profile={profile}
                    onApply={(v) => updateEducation(i, { institution: v as string })}
                  />
                </div>
                <input value={ed.institution} onChange={(e) => updateEducation(i, { institution: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Year started</label>
                  <AiSuggest
                    label={`Education ${i + 1} (${ed.degree || "untitled"}): year started`}
                    fieldType="string"
                    currentValue={ed.yearStart ?? ""}
                    profile={profile}
                    onApply={(v) => updateEducation(i, { yearStart: v as string })}
                  />
                </div>
                <input value={ed.yearStart ?? ""} onChange={(e) => updateEducation(i, { yearStart: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Year ended</label>
                  <AiSuggest
                    label={`Education ${i + 1} (${ed.degree || "untitled"}): year ended`}
                    fieldType="string"
                    currentValue={ed.yearEnd ?? ""}
                    profile={profile}
                    onApply={(v) => updateEducation(i, { yearEnd: v as string })}
                  />
                </div>
                <input value={ed.yearEnd ?? ""} onChange={(e) => updateEducation(i, { yearEnd: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Thesis title</label>
                  <AiSuggest
                    label={`Education ${i + 1} (${ed.degree || "untitled"}): thesis title`}
                    fieldType="string"
                    currentValue={ed.thesis ?? ""}
                    profile={profile}
                    onApply={(v) => updateEducation(i, { thesis: v as string })}
                  />
                </div>
                <input value={ed.thesis ?? ""} onChange={(e) => updateEducation(i, { thesis: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="field-label-row">
                  <label>Key topics (comma-separated)</label>
                  <AiSuggest
                    label={`Education ${i + 1} (${ed.degree || "untitled"}): key topics`}
                    fieldType="string"
                    currentValue={ed.topics ?? ""}
                    profile={profile}
                    onApply={(v) => updateEducation(i, { topics: v as string })}
                  />
                </div>
                <input value={ed.topics ?? ""} onChange={(e) => updateEducation(i, { topics: e.target.value })} />
              </div>
              <button type="button" className="secondary" onClick={() => removeEducation(i)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="secondary" onClick={addEducation}>
            + Add education
          </button>
        </div>

        <div className="card">
          <h3>Credentials</h3>
          <div className="form-row">
            <div className="field-label-row">
              <label>Certifications (comma-separated)</label>
              <AiSuggest
                label="Certifications"
                fieldType="string[]"
                currentValue={profile.certifications}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, certifications: v as string[] })}
              />
            </div>
            <input
              value={csv(profile.certifications)}
              onChange={(e) => setProfile({ ...profile, certifications: fromCsv(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Publications (comma-separated)</label>
              <AiSuggest
                label="Publications"
                fieldType="string[]"
                currentValue={profile.publications}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, publications: v as string[] })}
              />
            </div>
            <input
              value={csv(profile.publications)}
              onChange={(e) => setProfile({ ...profile, publications: fromCsv(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Awards (comma-separated)</label>
              <AiSuggest
                label="Awards"
                fieldType="string[]"
                currentValue={profile.awards}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, awards: v as string[] })}
              />
            </div>
            <input value={csv(profile.awards)} onChange={(e) => setProfile({ ...profile, awards: fromCsv(e.target.value) })} />
          </div>
        </div>

        <div className="card">
          <h3>Behavioral profile</h3>
          <div className="form-row">
            <div className="field-label-row">
              <label>Traits (comma-separated)</label>
              <AiSuggest
                label="Behavioral traits"
                fieldType="string[]"
                currentValue={profile.behavioral.traits}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, behavioral: { ...profile.behavioral, traits: v as string[] } })}
              />
            </div>
            <input
              value={csv(profile.behavioral.traits)}
              onChange={(e) => setProfile({ ...profile, behavioral: { ...profile.behavioral, traits: fromCsv(e.target.value) } })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Strengths</label>
              <AiSuggest
                label="Behavioral strengths"
                fieldType="string"
                currentValue={profile.behavioral.strengths}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, behavioral: { ...profile.behavioral, strengths: v as string } })}
              />
            </div>
            <textarea
              value={profile.behavioral.strengths}
              onChange={(e) => setProfile({ ...profile, behavioral: { ...profile.behavioral, strengths: e.target.value } })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Growth areas</label>
              <AiSuggest
                label="Growth areas"
                fieldType="string"
                currentValue={profile.behavioral.growthAreas}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, behavioral: { ...profile.behavioral, growthAreas: v as string } })}
              />
            </div>
            <textarea
              value={profile.behavioral.growthAreas}
              onChange={(e) => setProfile({ ...profile, behavioral: { ...profile.behavioral, growthAreas: e.target.value } })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Thrives in</label>
              <AiSuggest
                label="Thrives in (ideal environment)"
                fieldType="string"
                currentValue={profile.behavioral.idealEnvironment}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, behavioral: { ...profile.behavioral, idealEnvironment: v as string } })}
              />
            </div>
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
            <div className="field-label-row">
              <label>Target sectors (comma-separated)</label>
              <AiSuggest
                label="Target sectors"
                fieldType="string[]"
                currentValue={profile.targetSectors}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, targetSectors: v as string[] })}
              />
            </div>
            <input
              value={csv(profile.targetSectors)}
              onChange={(e) => setProfile({ ...profile, targetSectors: fromCsv(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Energizing tasks (comma-separated)</label>
              <AiSuggest
                label="Energizing tasks"
                fieldType="string[]"
                currentValue={profile.motivation.energizingTasks}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, motivation: { ...profile.motivation, energizingTasks: v as string[] } })}
              />
            </div>
            <input
              value={csv(profile.motivation.energizingTasks)}
              onChange={(e) =>
                setProfile({ ...profile, motivation: { ...profile.motivation, energizingTasks: fromCsv(e.target.value) } })
              }
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Draining tasks (comma-separated)</label>
              <AiSuggest
                label="Draining tasks"
                fieldType="string[]"
                currentValue={profile.motivation.drainingTasks}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, motivation: { ...profile.motivation, drainingTasks: v as string[] } })}
              />
            </div>
            <input
              value={csv(profile.motivation.drainingTasks)}
              onChange={(e) =>
                setProfile({ ...profile, motivation: { ...profile.motivation, drainingTasks: fromCsv(e.target.value) } })
              }
            />
          </div>
          <div className="form-row">
            <div className="field-label-row">
              <label>Deal-breakers (comma-separated)</label>
              <AiSuggest
                label="Deal-breakers"
                fieldType="string[]"
                currentValue={profile.dealbreakers}
                profile={profile}
                onApply={(v) => setProfile({ ...profile, dealbreakers: v as string[] })}
              />
            </div>
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
