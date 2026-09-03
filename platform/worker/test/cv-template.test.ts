import { describe, expect, it } from "vitest"
import { renderCvHtml } from "../src/lib/documents/cvTemplate.js"
import { renderCoverLetterHtml } from "../src/lib/documents/coverLetterTemplate.js"
import type { Profile } from "../src/lib/db/repositories/profiles.js"
import type { CoverLetterContent } from "../src/lib/documents/coverLetterDraft.js"

const profile: Profile = {
  userId: "u1",
  name: "Jane Doe",
  city: "Copenhagen",
  country: "Denmark",
  commuteConstraints: null,
  cvLanguage: "English",
  employmentStatus: null,
  linkedinHeadline: "Senior Data Engineer",
  noticePeriod: null,
  salaryExpectation: null,
  relocationWillingness: null,
  workArrangementPreference: null,
  portfolioUrl: null,
  languages: [{ language: "English", level: "C1" }],
  education: [{ degree: "MSc", field: "Computer Science", yearStart: "2018", yearEnd: "2020", institution: "DTU" }],
  experience: [{ title: "Data Engineer", company: "Acme", location: "Copenhagen", bullets: ["Built ETL pipelines"] }],
  skills: { primary: ["Python", "SQL"], secondary: [], domain: [], software: [] },
  certifications: [],
  publications: ["Doe, J. (2022). A Paper. Journal."],
  awards: ["Best Paper — Conf (2022)"],
  behavioral: { traits: [], strengths: "Systems thinking", growthAreas: "", idealEnvironment: "Autonomous teams" },
  motivation: { energizingTasks: [], drainingTasks: [] },
  targetSectors: [],
  dealbreakers: [],
  eligibility: { citizenshipOrPr: "Danish citizen", visaConstraintsNote: null },
  autoApplyEnabled: false,
  autoSubmitMode: "off",
  profileVersion: 1,
  updatedAt: new Date().toISOString(),
}

describe("renderCvHtml", () => {
  it("includes the candidate's name, email, and experience", () => {
    const html = renderCvHtml(profile, "jane@example.com")
    expect(html).toContain("Jane Doe")
    expect(html).toContain("jane@example.com")
    expect(html).toContain("Data Engineer")
    expect(html).toContain("Built ETL pipelines")
    expect(html).toContain("Acme")
  })

  it("escapes HTML-significant characters from profile data", () => {
    const withUnsafeName: Profile = { ...profile, name: "Jane <script>alert(1)</script> Doe" }
    const html = renderCvHtml(withUnsafeName, "jane@example.com")
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("omits optional sections that have no data", () => {
    const noExtras: Profile = { ...profile, publications: [], awards: [] }
    const html = renderCvHtml(noExtras, "jane@example.com")
    expect(html).not.toContain("Publications")
    expect(html).not.toContain("Honors and Awards")
  })

  it("renders the tailoring's profile statement and highlighted skills when given", () => {
    const html = renderCvHtml(profile, "jane@example.com", {
      profileStatement: "A data engineer with pipeline experience well suited to this role.",
      emphasizedSkills: ["Python", "SQL"],
    })
    expect(html).toContain("A data engineer with pipeline experience well suited to this role.")
    expect(html).toContain("Highlighted for this role:")
    expect(html).toContain("Python, SQL")
  })

  it("renders normally when no tailoring is given", () => {
    const html = renderCvHtml(profile, "jane@example.com", null)
    expect(html).not.toContain("Highlighted for this role")
  })
})

describe("renderCoverLetterHtml", () => {
  const content: CoverLetterContent = {
    greeting: "Dear Hiring Manager,",
    opening: "I am writing to apply for the Senior Data Engineer role.",
    body: "My experience building ETL pipelines maps directly to this role's needs.",
    achievements: ["Built a warehouse serving 50+ analysts"],
    connection: "Acme's focus on data quality aligns with my priorities.",
    personalFit: "I thrive in autonomous, high-trust teams.",
    closingLine: "I look forward to hearing from you.",
  }

  it("renders the letter body and achievements", () => {
    const html = renderCoverLetterHtml(profile, "jane@example.com", content)
    expect(html).toContain("Dear Hiring Manager,")
    expect(html).toContain("Built a warehouse serving 50+ analysts")
    expect(html).toContain("Jane Doe")
    expect(html).toContain("jane@example.com")
  })
})
