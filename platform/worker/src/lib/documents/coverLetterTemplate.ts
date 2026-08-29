import type { Profile } from "../db/repositories/profiles.js"
import type { CoverLetterContent } from "./coverLetterDraft.js"
import { LATO_REGULAR, RALEWAY_BOLD, RALEWAY_MEDIUM } from "./fonts.js"

// Replicates cover_letters/cover.cls's layout: a Huge name + contact line at
// top, dated paragraphs in Lato, bullets in Raleway-Medium (see cover.cls's
// own itemize-outside-\lettercontent pattern, documented in
// cover_example.tex) -- one page target.

function esc(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function renderCoverLetterHtml(profile: Profile, email: string, content: CoverLetterContent): string {
  const today = new Date().toISOString().slice(0, 10)
  const contactBits = [esc(email), profile.linkedinHeadline ? esc(profile.linkedinHeadline) : null].filter(Boolean)

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @font-face { font-family: "Lato"; src: url("${LATO_REGULAR}") format("truetype"); font-weight: 400; }
  @font-face { font-family: "Raleway"; src: url("${RALEWAY_BOLD}") format("opentype"); font-weight: 700; }
  @font-face { font-family: "Raleway"; src: url("${RALEWAY_MEDIUM}") format("opentype"); font-weight: 500; }
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: "Lato", sans-serif; font-size: 11pt; line-height: 1.5; color: #222; margin: 0; }
  h1.name { font-family: "Raleway", sans-serif; font-weight: 700; font-size: 26pt; margin: 0 0 4pt 0; }
  .contact { font-size: 9.5pt; color: #555; margin-bottom: 18pt; }
  .date { margin-bottom: 12pt; color: #444; }
  p { margin: 0 0 10pt 0; }
  ul.achievements { font-family: "Raleway", sans-serif; font-weight: 500; font-size: 11pt; margin: 0 0 10pt 0; padding-left: 16pt; }
  ul.achievements li { margin-bottom: 4pt; }
  .closing { margin-top: 16pt; }
  .signature { margin-top: 24pt; font-weight: 700; }
</style></head>
<body>
  <h1 class="name">${esc(profile.name) || "Candidate"}</h1>
  <div class="contact">${contactBits.join(" | ")}</div>
  <div class="date">${today}</div>

  <p>${esc(content.greeting)}</p>
  <p>${esc(content.opening)}</p>
  <p>${esc(content.body)}</p>
  <ul class="achievements">
    ${content.achievements.map((a) => `<li>${esc(a)}</li>`).join("")}
  </ul>
  <p>${esc(content.connection)}</p>
  <p>${esc(content.personalFit)}</p>
  <p>${esc(content.closingLine)}</p>

  <div class="closing">Kind regards,</div>
  <div class="signature">${esc(profile.name) || "Candidate"}</div>
</body></html>`
}
