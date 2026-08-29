import { describe, expect, it } from "vitest"
import { dedupeKey } from "../src/lib/dedupe.js"

describe("dedupeKey", () => {
  it("is stable for the same portal/title/company", async () => {
    const a = await dedupeKey("freehire", "Senior Engineer", "Acme Corp")
    const b = await dedupeKey("freehire", "Senior Engineer", "Acme Corp")
    expect(a).toBe(b)
  })

  it("is case- and whitespace-insensitive", async () => {
    const a = await dedupeKey("freehire", "Senior Engineer", "Acme Corp")
    const b = await dedupeKey("freehire", "  senior   engineer ", " ACME CORP ")
    expect(a).toBe(b)
  })

  it("differs across portals for the same title/company", async () => {
    const a = await dedupeKey("freehire", "Senior Engineer", "Acme Corp")
    const b = await dedupeKey("linkedin", "Senior Engineer", "Acme Corp")
    expect(a).not.toBe(b)
  })
})
