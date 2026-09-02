import { describe, expect, it } from "vitest"
import { matchFieldCategory } from "../src/lib/documents/autoSubmit.js"

describe("matchFieldCategory", () => {
  it("matches common label variants for each category", () => {
    expect(matchFieldCategory("Full Name")).toBe("name")
    expect(matchFieldCategory("Your name")).toBe("name")
    expect(matchFieldCategory("Email address")).toBe("email")
    expect(matchFieldCategory("Phone number")).toBe("phone")
    expect(matchFieldCategory("Upload your resume")).toBe("resume")
    expect(matchFieldCategory("CV")).toBe("resume")
    expect(matchFieldCategory("Cover letter")).toBe("coverLetter")
  })

  it("is case-insensitive", () => {
    expect(matchFieldCategory("EMAIL ADDRESS")).toBe("email")
  })

  it("prefers the more specific (longer) keyword when multiple match", () => {
    // "full name" is more specific than the bare "name" fallback keyword.
    expect(matchFieldCategory("Please enter your full name here")).toBe("name")
  })

  it("returns null for unrecognized labels", () => {
    expect(matchFieldCategory("LinkedIn profile URL")).toBeNull()
    expect(matchFieldCategory("")).toBeNull()
  })
})
