import { describe, expect, it } from "vitest"
import { validateRankingResponse, weightedScore, verdictForScore, isVetoed } from "../src/lib/ranking/schema.js"

describe("ranking schema", () => {
  it("validates a well-formed response", () => {
    const response = validateRankingResponse({
      scores: { technical: 80, experience: 70, behavioral: 60, career: 90 },
      location_verdict: "PASS",
      language_gate: "PASS",
      language_note: null,
      eligibility_verdict: "PASS",
      strengths: ["strong Python background"],
      gaps: ["no direct fintech experience"],
    })
    expect(response.scores.technical).toBe(80)
  })

  it("rejects a response with an out-of-range score", () => {
    expect(() =>
      validateRankingResponse({
        scores: { technical: 150, experience: 70, behavioral: 60, career: 90 },
        location_verdict: "PASS",
        language_gate: "PASS",
        language_note: null,
        eligibility_verdict: "PASS",
        strengths: [],
        gaps: [],
      }),
    ).toThrow()
  })

  it("rejects a response with an invalid enum value", () => {
    expect(() =>
      validateRankingResponse({
        scores: { technical: 80, experience: 70, behavioral: 60, career: 90 },
        location_verdict: "MAYBE",
        language_gate: "PASS",
        language_note: null,
        eligibility_verdict: "PASS",
        strengths: [],
        gaps: [],
      }),
    ).toThrow()
  })

  it("computes the weighted score using the 30/25/15/30 rubric weights", () => {
    // 100*0.30 + 100*0.25 + 100*0.15 + 100*0.30 = 100
    expect(weightedScore({ technical: 100, experience: 100, behavioral: 100, career: 100 })).toBeCloseTo(100)
    // 80*0.30 + 60*0.25 + 40*0.15 + 90*0.30 = 24 + 15 + 6 + 27 = 72
    expect(weightedScore({ technical: 80, experience: 60, behavioral: 40, career: 90 })).toBeCloseTo(72)
  })

  it("maps scores to verdicts using the documented thresholds", () => {
    expect(verdictForScore(80)).toBe("Strong Fit")
    expect(verdictForScore(65)).toBe("Good Fit")
    expect(verdictForScore(50)).toBe("Moderate Fit")
    expect(verdictForScore(35)).toBe("Weak Fit")
    expect(verdictForScore(10)).toBe("Poor Fit")
  })

  it("treats any FAIL gate as a veto", () => {
    expect(isVetoed({ location_verdict: "FAIL", language_gate: "PASS", eligibility_verdict: "PASS" })).toBe(true)
    expect(isVetoed({ location_verdict: "PASS", language_gate: "FAIL", eligibility_verdict: "PASS" })).toBe(true)
    expect(isVetoed({ location_verdict: "PASS", language_gate: "PASS", eligibility_verdict: "FAIL" })).toBe(true)
    expect(isVetoed({ location_verdict: "PASS", language_gate: "FLAG", eligibility_verdict: "unverified" })).toBe(false)
  })
})
