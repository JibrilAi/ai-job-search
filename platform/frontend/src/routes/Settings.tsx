import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../api/AuthContext.js"
import { profileApi, ApiError, type Profile, type AutoSubmitMode } from "../api/client.js"

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    profileApi
      .get()
      .then(({ profile }) => setProfile(profile))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your settings."))
  }, [])

  async function handleLogout() {
    await logout()
    navigate("/login")
  }

  async function toggleAutoApply(next: boolean) {
    if (!profile) return
    setError(null)
    setSaving(true)
    const { userId, profileVersion, updatedAt, ...input } = profile
    try {
      // Turning auto-draft off also turns off auto-submit -- there's
      // nothing to submit without a draft, and it avoids a confusing
      // "auto-submit: unattended" setting sitting around inert.
      const { profile: saved } = await profileApi.save({ ...input, autoApplyEnabled: next, autoSubmitMode: next ? input.autoSubmitMode : "off" })
      setProfile(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that setting.")
    } finally {
      setSaving(false)
    }
  }

  async function changeAutoSubmitMode(next: AutoSubmitMode) {
    if (!profile) return
    setError(null)
    setSaving(true)
    const { userId, profileVersion, updatedAt, ...input } = profile
    try {
      const { profile: saved } = await profileApi.save({ ...input, autoSubmitMode: next })
      setProfile(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that setting.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <h1>Settings</h1>
      <div className="card">
        <p>
          Signed in as <strong>{user?.email}</strong>
        </p>
        <button className="secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Auto-apply</h2>
        {profile === undefined && <p className="muted">Loading…</p>}
        {profile === null && (
          <p className="muted">
            Save your profile first — auto-apply needs one to generate documents from.
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        {profile && (
          <>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={profile.autoApplyEnabled}
                disabled={saving}
                onChange={(e) => toggleAutoApply(e.target.checked)}
              />
              <span>
                <strong>Auto-draft applications for strong matches</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  When a job ranks Strong or Good Fit for you, automatically generate a tailored CV, cover letter, and
                  a drafted entry in your Application Tracker — ready for you to review and apply. This never submits
                  anything to a job board on its own; you still click Apply yourself. When off, you generate documents
                  manually per job, as before.
                </p>
              </span>
            </label>

            {profile.autoApplyEnabled && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border, #333)" }}>
                <strong>Auto-submit to freehire.me</strong>
                <p className="muted" style={{ margin: "4px 0 10px" }}>
                  Goes further than drafting: fills in the actual application form on freehire.me. Only applies to
                  freehire.me jobs — every other portal (including LinkedIn) still stops at drafting, since automating
                  a real submission there risks your account being flagged or banned.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label className="toggle-row">
                    <input
                      type="radio"
                      name="autoSubmitMode"
                      checked={profile.autoSubmitMode === "off"}
                      disabled={saving}
                      onChange={() => changeAutoSubmitMode("off")}
                    />
                    <span>Off — draft only (default)</span>
                  </label>
                  <label className="toggle-row">
                    <input
                      type="radio"
                      name="autoSubmitMode"
                      checked={profile.autoSubmitMode === "confirm"}
                      disabled={saving}
                      onChange={() => changeAutoSubmitMode("confirm")}
                    />
                    <span>
                      Auto-fill, then I confirm — fills the form and stops; you send it yourself from the tracker
                    </span>
                  </label>
                  <label className="toggle-row">
                    <input
                      type="radio"
                      name="autoSubmitMode"
                      checked={profile.autoSubmitMode === "unattended"}
                      disabled={saving}
                      onChange={() => changeAutoSubmitMode("unattended")}
                    />
                    <span>
                      Fully unattended — submits immediately, nobody reviews it first.{" "}
                      <strong>A wrong or hallucinated submission goes out under your name with no way to catch it.</strong>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
