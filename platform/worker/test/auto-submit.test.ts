import { describe, expect, it } from "vitest"
import { matchFieldCategory, fieldValue } from "../src/lib/documents/autoSubmit.js"
import type { Profile } from "../src/lib/db/repositories/profiles.js"

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

  it("matches the application-screener categories", () => {
    expect(matchFieldCategory("Notice period")).toBe("noticePeriod")
    expect(matchFieldCategory("What is your salary expectation?")).toBe("salaryExpectation")
    expect(matchFieldCategory("Are you willing to relocate?")).toBe("relocation")
    expect(matchFieldCategory("Remote/Hybrid/Onsite preference")).toBe("workArrangement")
    expect(matchFieldCategory("GitHub profile")).toBe("portfolio")
    expect(matchFieldCategory("Are you legally eligible to work in Canada?")).toBe("workAuthorization")
    expect(matchFieldCategory("Will you now or in the future require visa sponsorship?")).toBe("sponsorship")
  })

  it("never matches an EEO/voluntary-self-identification field, even if it contains an otherwise-matching word", () => {
    expect(matchFieldCategory("Voluntary Self-Identification of Disability")).toBeNull()
    expect(matchFieldCategory("Race / Ethnicity (voluntary)")).toBeNull()
    expect(matchFieldCategory("Gender Identity")).toBeNull()
    expect(matchFieldCategory("Veteran Status")).toBeNull()
    expect(matchFieldCategory("EEO Disclosure")).toBeNull()
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

const PROFILE: Profile = {
  userId: "u1",
  name: "Jane Doe",
  city: null,
  country: null,
  commuteConstraints: null,
  cvLanguage: null,
  employmentStatus: null,
  linkedinHeadline: null,
  noticePeriod: "2 weeks",
  salaryExpectation: "$120,000 CAD",
  relocationWillingness: "Open to relocating within Canada",
  workArrangementPreference: "Remote preferred",
  portfolioUrl: "https://github.com/janedoe",
  languages: [],
  education: [],
  experience: [],
  skills: { primary: [], secondary: [], domain: [], software: [] },
  certifications: [],
  publications: [],
  awards: [],
  behavioral: { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" },
  motivation: { energizingTasks: [], drainingTasks: [] },
  targetSectors: [],
  dealbreakers: [],
  eligibility: { citizenshipOrPr: "Canadian citizen", visaConstraintsNote: "No sponsorship needed" },
  autoApplyEnabled: false,
  autoSubmitMode: "off",
  profileVersion: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("fieldValue", () => {
  it("maps each application-screener category to the matching profile field", () => {
    const params = { profile: PROFILE, userEmail: "jane@example.com" }
    expect(fieldValue("name", params)).toBe("Jane Doe")
    expect(fieldValue("email", params)).toBe("jane@example.com")
    expect(fieldValue("noticePeriod", params)).toBe("2 weeks")
    expect(fieldValue("salaryExpectation", params)).toBe("$120,000 CAD")
    expect(fieldValue("relocation", params)).toBe("Open to relocating within Canada")
    expect(fieldValue("workArrangement", params)).toBe("Remote preferred")
    expect(fieldValue("portfolio", params)).toBe("https://github.com/janedoe")
    expect(fieldValue("workAuthorization", params)).toBe("Canadian citizen")
    expect(fieldValue("sponsorship", params)).toBe("No sponsorship needed")
  })

  it("returns null for categories this app never fills as text (phone, resume, coverLetter)", () => {
    const params = { profile: PROFILE, userEmail: "jane@example.com" }
    expect(fieldValue("phone", params)).toBeNull()
    expect(fieldValue("resume", params)).toBeNull()
    expect(fieldValue("coverLetter", params)).toBeNull()
  })
})
