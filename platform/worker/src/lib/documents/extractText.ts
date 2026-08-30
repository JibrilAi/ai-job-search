// Plain text extraction from a PDF, for feeding to Claude (resume import).
// Shares the same unpdf-based approach as verifyPdf.ts's ATS check, but
// returns raw text instead of a linting report.
import { extractText, getDocumentProxy } from "unpdf"

export async function extractPdfText(pdfBytes: ArrayBuffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes))
  const { text: pages } = await extractText(doc, { mergePages: false })
  return pages.join("\n\n")
}
