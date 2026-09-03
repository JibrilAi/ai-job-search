import puppeteer, { type Page } from "@cloudflare/puppeteer"
import type { Env } from "../../types.js"
import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"
import type { GeneratedDocumentRow } from "../db/repositories/documents.js"

/**
 * Browser automation that fills (and optionally submits) a job
 * application form, scoped deliberately to freehire.me only -- see
 * autoDraft.ts's docstring for the full reasoning on why LinkedIn is
 * excluded (account-ban risk, ToS). Called from autoDraftApplication
 * after CV/cover-letter documents exist, and from the
 * POST /applications/:id/submit route for the "confirm" mode's send step.
 *
 * IMPORTANT: this repo's sandbox network policy blocks direct requests to
 * freehire.me, so this file's field-matching selectors are a best-guess,
 * generic heuristic (label/name/placeholder keyword matching against
 * common application-form patterns), not a verified freehire.me-specific
 * integration. Treat the first deployment of this as a first attempt --
 * it will very likely need at least one round of "here's what broke"
 * iteration against the real site, the same way the AI-suggest fixes did.
 */

// Categories and label-phrasing synonyms come from researching how
// LinkedIn Easy Apply, Indeed, and the major ATS platforms (Greenhouse,
// Lever, Workday, iCIMS, SmartRecruiters) phrase common screener
// questions -- see the profile fields these map to in
// lib/db/repositories/profiles.ts.
const FIELD_KEYWORDS = {
  name: ["full name", "your name", "applicant name", "name"],
  email: ["email"],
  phone: ["phone", "mobile", "telephone"],
  resume: ["resume", "cv", "curriculum vitae"],
  coverLetter: ["cover letter", "cover note", "motivation letter"],
  noticePeriod: ["notice period", "earliest start date", "when can you start", "start date", "availability"],
  salaryExpectation: ["salary expectation", "expected compensation", "desired salary", "compensation range", "expected salary"],
  relocation: ["willing to relocate", "relocation assistance", "willingness to relocate"],
  workArrangement: ["remote/hybrid/onsite", "remote, hybrid, or onsite", "work arrangement", "work location preference"],
  portfolio: ["portfolio", "github", "personal website", "work samples"],
  workAuthorization: ["authorized to work", "legally eligible to work", "eligible to work in", "right to work", "work authorization"],
  sponsorship: ["require sponsorship", "visa sponsorship", "immigration sponsorship", "commence an immigration case"],
} as const

export type FieldCategory = keyof typeof FIELD_KEYWORDS

// EEO/voluntary-self-identification fields (race, ethnicity, gender,
// veteran status, disability) are never auto-filled or guessed, full
// stop -- every platform researched treats these as legally voluntary and
// separate from the rest of the application. This is an active
// exclusion, not just an absent category: a field whose label matches any
// of these is skipped even if it would otherwise coincidentally match
// something in FIELD_KEYWORDS above, so the automation can never
// accidentally answer on a candidate's behalf. See
// migrations/0013_profile_application_fields.sql's comment for the same
// boundary applied to what this app stores at all.
const NEVER_FILL_KEYWORDS = [
  "voluntary self-identification",
  "equal employment opportunity",
  "affirmative action",
  "race",
  "ethnicity",
  "gender identity",
  "veteran status",
  "disability status",
  "decline to self-identify",
  " eeo",
]

function isNeverFillField(labelText: string): boolean {
  const lower = ` ${labelText.toLowerCase()}`
  return NEVER_FILL_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/** Pure, unit-testable: classifies a form field's best-guess label text into one of the categories above, longest/most-specific keyword wins. Never matches an EEO/demographic field -- see NEVER_FILL_KEYWORDS. */
export function matchFieldCategory(labelText: string): FieldCategory | null {
  if (isNeverFillField(labelText)) return null
  const lower = labelText.toLowerCase()
  let best: { category: FieldCategory; keywordLength: number } | null = null
  for (const [category, keywords] of Object.entries(FIELD_KEYWORDS) as [FieldCategory, readonly string[]][]) {
    for (const keyword of keywords) {
      if (lower.includes(keyword) && (!best || keyword.length > best.keywordLength)) {
        best = { category, keywordLength: keyword.length }
      }
    }
  }
  return best?.category ?? null
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// page.evaluate()'s callback runs in the *browser's* page context (a real
// DOM), not the Worker's -- and the Worker's own tsconfig deliberately has
// no "dom" lib (adding it globally conflicts with @cloudflare/workers-types'
// Worker-runtime globals across the rest of this project). So these
// callbacks are typed loosely (`any`) and reach the DOM through
// `globalThis` rather than referencing DOM type names TS can't see here --
// this only affects our own type-checking, not what actually runs in the
// browser at request time.

// Cloudflare's Browser Rendering environment has no writable local
// filesystem for Puppeteer's usual elementHandle.uploadFile(path) API, so
// the PDF bytes are injected client-side instead: base64 the buffer over
// the CDP evaluate() call, reconstruct it as a File in the page context,
// and assign it to the input via the DataTransfer API (the same mechanism
// a real drag-and-drop upload uses), then fire the events most form
// libraries listen for.
async function setFileInput(page: Page, selector: string, bytes: ArrayBuffer, filename: string, mimeType: string): Promise<void> {
  await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((sel: string, base64Data: string, name: string, type: string) => {
      const g = globalThis as any
      const input = g.document.querySelector(sel)
      if (!input) return
      const byteChars = g.atob(base64Data)
      const byteNumbers = new Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
      const file = new g.File([new g.Uint8Array(byteNumbers)], name, { type })
      const dt = new g.DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new g.Event("input", { bubbles: true }))
      input.dispatchEvent(new g.Event("change", { bubbles: true }))
    }) as any,
    selector,
    arrayBufferToBase64(bytes),
    filename,
    mimeType,
  )
}

interface DetectedField {
  index: number
  label: string
  type: string
}

async function detectFields(page: Page): Promise<DetectedField[]> {
  return page.evaluate((() => {
    const g = globalThis as any
    const els = Array.from(g.document.querySelectorAll("input, textarea, select"))
    return els.map((el: any, i: number) => {
      const labelEl = el.closest("label") ?? (el.id ? g.document.querySelector(`label[for="${el.id}"]`) : null)
      const label = labelEl?.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || ""
      el.setAttribute("data-autosubmit-index", String(i))
      return { index: i, label: label.trim(), type: el.type || el.tagName.toLowerCase() }
    })
  }) as any) as Promise<DetectedField[]>
}

/** Pure, unit-testable: maps a matched field category to the profile value that answers it, or null if this app has nothing to offer for that category. */
export function fieldValue(category: FieldCategory, params: { profile: Profile; userEmail: string }): string | null {
  switch (category) {
    case "name":
      return params.profile.name
    case "email":
      return params.userEmail
    case "noticePeriod":
      return params.profile.noticePeriod
    case "salaryExpectation":
      return params.profile.salaryExpectation
    case "relocation":
      return params.profile.relocationWillingness
    case "workArrangement":
      return params.profile.workArrangementPreference
    case "portfolio":
      return params.profile.portfolioUrl
    case "workAuthorization":
      return params.profile.eligibility.citizenshipOrPr
    case "sponsorship":
      return params.profile.eligibility.visaConstraintsNote
    // phone: no phone field exists in the profile yet (see README's known
    // limitations). resume/coverLetter: handled separately above as file
    // inputs, never as text.
    case "phone":
    case "resume":
    case "coverLetter":
      return null
  }
}

export type AutoSubmitOutcome = { status: "ready_to_submit" | "applied"; note: string }

/**
 * Fills a freehire.me application form and, when `submit` is true, also
 * clicks the real submit action. `submit: false` is the "confirm" mode's
 * preview pass (stops short of sending); `submit: true` is used both by
 * "unattended" mode (called immediately after drafting) and by the
 * confirm mode's user-triggered send.
 */
export async function runFreehireApplication(
  env: Env,
  params: {
    job: JobRow
    profile: Profile
    userEmail: string
    cvDoc: GeneratedDocumentRow | null
    coverLetterDoc: GeneratedDocumentRow | null
    submit: boolean
  },
): Promise<AutoSubmitOutcome> {
  if (params.job.portal !== "freehire") {
    throw new Error(`auto-submit only supports freehire.me jobs (got portal "${params.job.portal}")`)
  }

  const browser = await puppeteer.launch(env.BROWSER)
  try {
    const page = await browser.newPage()
    await page.goto(params.job.sourceUrl, { waitUntil: "networkidle0", timeout: 30000 })

    const fields = await detectFields(page)

    for (const field of fields) {
      const category = matchFieldCategory(field.label)
      if (!category) continue
      const selector = `[data-autosubmit-index="${field.index}"]`

      if (field.type === "file") {
        const doc = category === "resume" ? params.cvDoc : category === "coverLetter" ? params.coverLetterDoc : null
        if (!doc) continue
        const object = await env.DOCUMENTS_BUCKET.get(doc.r2Key)
        const bytes = await object?.arrayBuffer()
        if (bytes) await setFileInput(page, selector, bytes, doc.type === "cv" ? "CV.pdf" : "CoverLetter.pdf", "application/pdf")
        continue
      }

      const value = fieldValue(category, params)
      if (value) await page.type(selector, value)
    }

    if (!params.submit) {
      return { status: "ready_to_submit", note: "Application form auto-filled -- review and send from the tracker." }
    }

    const clicked = await (page.evaluate((() => {
      const g = globalThis as any
      const candidates: any[] = Array.from(g.document.querySelectorAll("button, input[type=submit]"))
      const target = candidates.find((el) => {
        const text = (el.textContent || el.value || "").toLowerCase()
        return /submit|apply|send/.test(text)
      })
      if (!target) return false
      target.click()
      return true
    }) as any) as Promise<boolean>)
    if (!clicked) {
      return { status: "ready_to_submit", note: "Auto-fill succeeded but no submit button could be found automatically -- please send this application manually." }
    }

    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {})
    return { status: "applied", note: "Submitted automatically via the freehire.me auto-apply engine." }
  } finally {
    await browser.close()
  }
}
