import { describe, expect, it } from "vitest"
import { keepOwnedSkills } from "../src/lib/documents/cvTailoring.js"
import type { Profile } from "../src/lib/db/repositories/profiles.js"

const profile: Profile = {
  userId: "u1",
  name: "Jane Doe",
  city: null,
  country: null,
  commuteConstraints: null,
  cvLanguage: null,
  employmentStatus: null,
  linkedinHeadline: null,
  languages: [],
  education: [],
  experience: [],
  skills: { primary: ["Python", "SQL"], secondary: ["Docker"], domain: ["Data Engineering"], software: [] },
  certifications: [],
  publications: [],
  awards: [],
  behavioral: { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" },
  motivation: { energizingTasks: [], drainingTasks: [] },
  targetSectors: [],
  dealbreakers: [],
  eligibility: { citizenshipOrPr: null, visaConstraintsNote: null },
  autoApplyEnabled: false,
  profileVersion: 1,
  updatedAt: new Date().toISOString(),
}

describe("keepOwnedSkills", () => {
  it("keeps skills the profile actually lists, case-insensitively", () => {
    expect(keepOwnedSkills(["python", "Docker"], profile)).toEqual(["python", "Docker"])
  })

  it("drops a skill Claude invented that isn't in the candidate's profile", () => {
    expect(keepOwnedSkills(["Python", "Kubernetes"], profile)).toEqual(["Python"])
  })

  it("de-duplicates repeated entries", () => {
    expect(keepOwnedSkills(["Python", "python", "Python"], profile)).toEqual(["Python"])
  })

  it("returns an empty list when nothing matches", () => {
    expect(keepOwnedSkills(["Rust", "Go"], profile)).toEqual([])
  })
})
