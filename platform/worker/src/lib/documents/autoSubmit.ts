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

const FIELD_KEYWORDS = {
  name: ["full name", "your name", "applicant name", "name"],
  email: ["email"],
  phone: ["phone", "mobile", "telephone"],
  resume: ["resume", "cv", "curriculum vitae"],
  coverLetter: ["cover letter", "cover note", "motivation letter"],
} as const

export type FieldCategory = keyof typeof FIELD_KEYWORDS

/** Pure, unit-testable: classifies a form field's best-guess label text into one of the categories above, longest/most-specific keyword wins. */
export function matchFieldCategory(labelText: string): FieldCategory | null {
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

      const value = category === "name" ? params.profile.name : category === "email" ? params.userEmail : null
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
