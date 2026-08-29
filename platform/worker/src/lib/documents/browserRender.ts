import puppeteer from "@cloudflare/puppeteer"
import type { Env } from "../../types.js"

/**
 * Renders a standalone HTML document to PDF via Cloudflare's Browser
 * Rendering API (the `BROWSER` binding declared in wrangler.toml). This is
 * the one piece of the platform that genuinely needs a live Cloudflare
 * account to exercise -- `wrangler dev --local` cannot spin up a real
 * headless browser, so this path is unverified beyond typechecking; test it
 * against a deployed Worker before relying on it (see platform/README.md's
 * Known limitations).
 */
export async function renderHtmlToPdf(env: Env, html: string): Promise<ArrayBuffer> {
  const browser = await puppeteer.launch(env.BROWSER)
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle0" })
    const pdf = await page.pdf({ format: "A4", printBackground: true })
    return pdf.buffer as ArrayBuffer
  } finally {
    await browser.close()
  }
}
