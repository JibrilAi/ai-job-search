// ATS text-layer check, the Workers-compatible equivalent of tools/verify_pdf.py
// (which shells out to pypdf/pdftotext -- not available in the Workers
// runtime). Uses `unpdf`, which bundles a PDF.js build compiled specifically
// for serverless/edge runtimes (no DOM, no Web Worker) -- raw pdfjs-dist was
// tried first and failed at runtime (its normal build refuses to run without
// spinning up a Web Worker, which the Workers runtime doesn't provide; see
// git history / platform/README.md for the exact error this replaced).
import { extractText, getDocumentProxy } from "unpdf"

export interface AtsVerificationReport {
  pageCount: number
  charCount: number
  warnings: string[]
  passed: boolean
}

export async function verifyAtsTextLayer(pdfBytes: ArrayBuffer): Promise<AtsVerificationReport> {
  const warnings: string[] = []
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes))
  const { totalPages, text: pages } = await extractText(doc, { mergePages: false })

  pages.forEach((pageText, i) => {
    if (pageText.trim().length === 0) {
      warnings.push(`page ${i + 1} has no extractable text (rendered as an image, or a font-embedding failure)`)
    }
  })
  const fullText = pages.join("\n")

  if (/\(cid:\d+\)/.test(fullText)) {
    warnings.push("extracted text contains (cid:*) markers -- font glyphs did not map to embedded Unicode, ATS parsers will see gibberish")
  }
  if (fullText.includes("�")) {
    warnings.push("extracted text contains � replacement characters -- encoding did not round-trip cleanly")
  }
  if (!/@/.test(fullText)) {
    warnings.push("no '@' found in extracted text -- the contact email may not be selectable text")
  }

  return {
    pageCount: totalPages,
    charCount: fullText.trim().length,
    warnings,
    passed: warnings.length === 0,
  }
}
