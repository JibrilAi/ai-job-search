import { describe, expect, it } from "vitest"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { verifyAtsTextLayer } from "../src/lib/documents/verifyPdf.js"

async function buildTestPdf(text: string): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText(text, { x: 50, y: 780, size: 12, font, color: rgb(0, 0, 0) })
  const bytes = await doc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe("verifyAtsTextLayer", () => {
  it("extracts selectable text from a real PDF and passes with no warnings", async () => {
    const pdf = await buildTestPdf("Jane Doe jane.doe@example.com Senior Data Engineer")
    const report = await verifyAtsTextLayer(pdf)
    expect(report.pageCount).toBe(1)
    expect(report.charCount).toBeGreaterThan(0)
    expect(report.warnings).toEqual([])
    expect(report.passed).toBe(true)
  })

  it("flags a PDF whose text layer has no '@' as a contact-detail warning", async () => {
    const pdf = await buildTestPdf("Jane Doe Senior Data Engineer no contact details here")
    const report = await verifyAtsTextLayer(pdf)
    expect(report.passed).toBe(false)
    expect(report.warnings.some((w) => w.includes("@"))).toBe(true)
  })

  it("flags a page with no extractable text", async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842]) // blank page, no text drawn
    const bytes = await doc.save()
    const pdf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

    const report = await verifyAtsTextLayer(pdf)
    expect(report.passed).toBe(false)
    expect(report.warnings.some((w) => w.includes("no extractable text"))).toBe(true)
  })
})
