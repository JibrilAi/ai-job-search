import type { Profile } from "../db/repositories/profiles.js"
import { LATO_REGULAR, LATO_BOLD, RALEWAY_SEMIBOLD } from "./fonts.js"

// Replicates cv/main_example.tex's moderncv "banking" style layout (large
// blue name, colored section headings with a rule, date-column entries) in
// HTML/CSS for the Browser Rendering API -- see docs/architecture.md.

const ACCENT = "#1a4b8c" // moderncv "blue" color1 approximation

function esc(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function entryDateRange(start?: string, end?: string): string {
  if (!start && !end) return ""
  return `${start ?? ""}${start || end ? "–" : ""}${end ?? "Present"}`
}

export interface CvTailoringInput {
  profileStatement: string
  emphasizedSkills: string[]
}

export function renderCvHtml(profile: Profile, email: string, tailoring?: CvTailoringInput | null): string {
  const experienceHtml = profile.experience
    .map(
      (e) => `
    <div class="entry">
      <div class="entry-date">${esc(entryDateRange(e.startDate, e.endDate))}</div>
      <div class="entry-body">
        <div class="entry-title">${esc(e.title)} <span class="entry-org">${esc(e.company)}${e.location ? `, ${esc(e.location)}` : ""}</span></div>
        <ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      </div>
    </div>`,
    )
    .join("")

  const educationHtml = profile.education
    .map(
      (ed) => `
    <div class="entry">
      <div class="entry-date">${esc(entryDateRange(ed.yearStart, ed.yearEnd))}</div>
      <div class="entry-body">
        <div class="entry-title">${esc(ed.degree)}${ed.field ? ` in ${esc(ed.field)}` : ""} <span class="entry-org">${esc(ed.institution)}</span></div>
        ${ed.thesis ? `<p>Thesis: "${esc(ed.thesis)}."${ed.topics ? ` ${esc(ed.topics)}` : ""}</p>` : ed.topics ? `<p>${esc(ed.topics)}</p>` : ""}
      </div>
    </div>`,
    )
    .join("")

  const skillsHtml = [
    tailoring?.emphasizedSkills.length
      ? `<li><strong>Highlighted for this role:</strong> ${esc(tailoring.emphasizedSkills.join(", "))}</li>`
      : "",
    profile.skills.primary.length ? `<li><strong>Primary:</strong> ${esc(profile.skills.primary.join(", "))}</li>` : "",
    profile.skills.secondary.length ? `<li><strong>Secondary:</strong> ${esc(profile.skills.secondary.join(", "))}</li>` : "",
    profile.skills.domain.length ? `<li><strong>Domain:</strong> ${esc(profile.skills.domain.join(", "))}</li>` : "",
    profile.skills.software.length ? `<li><strong>Software:</strong> ${esc(profile.skills.software.join(", "))}</li>` : "",
  ]
    .filter(Boolean)
    .join("")

  const languagesHtml = profile.languages.map((l) => `${esc(l.language)} (${esc(l.level)})`).join(", ")

  const contactLine = [
    esc(email),
    profile.city && profile.country ? `${esc(profile.city)}, ${esc(profile.country)}` : null,
    profile.linkedinHeadline ? esc(profile.linkedinHeadline) : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @font-face { font-family: "Lato"; src: url("${LATO_REGULAR}") format("truetype"); font-weight: 400; }
  @font-face { font-family: "Lato"; src: url("${LATO_BOLD}") format("truetype"); font-weight: 700; }
  @font-face { font-family: "Raleway"; src: url("${RALEWAY_SEMIBOLD}") format("opentype"); font-weight: 600; }
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Lato", sans-serif; font-size: 10.5pt; color: #222; margin: 0; }
  h1.name { font-family: "Raleway", sans-serif; font-weight: 600; font-size: 28pt; color: ${ACCENT}; margin: 0 0 2pt 0; }
  .contact { font-size: 9.5pt; color: #444; margin-bottom: 10pt; }
  .profile-statement { font-size: 10pt; color: #333; margin-bottom: 14pt; }
  section { margin-bottom: 12pt; }
  h2 { font-family: "Raleway", sans-serif; font-weight: 600; font-size: 12pt; color: ${ACCENT};
       border-bottom: 1.2pt solid ${ACCENT}; padding-bottom: 2pt; margin: 0 0 6pt 0; text-transform: uppercase; letter-spacing: 0.5pt; }
  .entry { display: grid; grid-template-columns: 78pt 1fr; gap: 6pt; margin-bottom: 7pt; }
  .entry-date { font-size: 9pt; color: #555; font-weight: 700; }
  .entry-title { font-weight: 700; margin-bottom: 2pt; }
  .entry-org { font-weight: 400; color: #555; }
  ul { margin: 2pt 0 0 0; padding-left: 14pt; }
  li { margin-bottom: 1.5pt; }
  section > ul { padding-left: 14pt; }
</style></head>
<body>
  <h1 class="name">${esc(profile.name) || "Candidate"}</h1>
  <div class="contact">${contactLine}${profile.commuteConstraints ? ` · ${esc(profile.commuteConstraints)}` : ""}</div>
  ${tailoring?.profileStatement ? `<p class="profile-statement">${esc(tailoring.profileStatement)}</p>` : ""}

  <section>
    <h2>Core Competencies</h2>
    <ul>${skillsHtml}</ul>
  </section>

  <section>
    <h2>Professional Experience</h2>
    ${experienceHtml || "<p>No experience listed.</p>"}
  </section>

  <section>
    <h2>Education</h2>
    ${educationHtml || "<p>No education listed.</p>"}
  </section>

  ${
    profile.languages.length
      ? `<section><h2>Languages</h2><ul><li>${languagesHtml}</li></ul></section>`
      : ""
  }
  ${
    profile.publications.length
      ? `<section><h2>Publications</h2><ul>${profile.publications.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></section>`
      : ""
  }
  ${
    profile.awards.length
      ? `<section><h2>Honors and Awards</h2><ul>${profile.awards.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></section>`
      : ""
  }
  <section>
    <h2>References</h2>
    <ul><li>Available upon request.</li></ul>
  </section>
</body></html>`
}
