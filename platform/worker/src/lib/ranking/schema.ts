// Structured shape the ranking prompt (prompt.ts) asks Claude to return via
// forced tool-use, and this module's runtime validation of that response --
// reproduces the seen_jobs.json rank_* field shape that /rank produces locally.

export interface RawRankingResponse {
  scores: {
    technical: number
    experience: number
    behavioral: number
    career: number
  }
  location_verdict: "PASS" | "FAIL" | "FLAG"
  language_gate: "PASS" | "FAIL" | "FLAG"
  language_note: string | null
  eligibility_verdict: "PASS" | "FAIL" | "unverified"
  strengths: string[]
  gaps: string[]
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
}

export function validateRankingResponse(value: unknown): RawRankingResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("ranking response is not an object")
  }
  const v = value as Record<string, unknown>
  const scores = v.scores as Record<string, unknown> | undefined
  if (!scores || !isScore(scores.technical) || !isScore(scores.experience) || !isScore(scores.behavioral) || !isScore(scores.career)) {
    throw new Error("ranking response has invalid or missing scores")
  }
  if (!["PASS", "FAIL", "FLAG"].includes(v.location_verdict as string)) {
    throw new Error("ranking response has invalid location_verdict")
  }
  if (!["PASS", "FAIL", "FLAG"].includes(v.language_gate as string)) {
    throw new Error("ranking response has invalid language_gate")
  }
  if (!["PASS", "FAIL", "unverified"].includes(v.eligibility_verdict as string)) {
    throw new Error("ranking response has invalid eligibility_verdict")
  }
  if (!Array.isArray(v.strengths) || !Array.isArray(v.gaps)) {
    throw new Error("ranking response has invalid strengths/gaps")
  }

  return {
    scores: {
      technical: scores.technical as number,
      experience: scores.experience as number,
      behavioral: scores.behavioral as number,
      career: scores.career as number,
    },
    location_verdict: v.location_verdict as RawRankingResponse["location_verdict"],
    language_gate: v.language_gate as RawRankingResponse["language_gate"],
    language_note: typeof v.language_note === "string" ? v.language_note : null,
    eligibility_verdict: v.eligibility_verdict as RawRankingResponse["eligibility_verdict"],
    strengths: (v.strengths as unknown[]).map(String),
    gaps: (v.gaps as unknown[]).map(String),
  }
}

// Weights from .claude/skills/job-application-assistant/04-job-evaluation.md
// ("## Weighting"). Location is pass/fail, not weighted into the score.
const WEIGHTS = { technical: 0.3, experience: 0.25, behavioral: 0.15, career: 0.3 }

export function weightedScore(scores: RawRankingResponse["scores"]): number {
  return (
    scores.technical * WEIGHTS.technical +
    scores.experience * WEIGHTS.experience +
    scores.behavioral * WEIGHTS.behavioral +
    scores.career * WEIGHTS.career
  )
}

// Thresholds from the same document's "## Thresholds" section.
export function verdictForScore(score: number): string {
  if (score >= 75) return "Strong Fit"
  if (score >= 60) return "Good Fit"
  if (score >= 45) return "Moderate Fit"
  if (score >= 30) return "Weak Fit"
  return "Poor Fit"
}

/** A hard FAIL on any gate vetoes the shortlist regardless of score (mirrors /rank's veto behavior). */
export function isVetoed(r: Pick<RawRankingResponse, "location_verdict" | "language_gate" | "eligibility_verdict">): boolean {
  return r.location_verdict === "FAIL" || r.language_gate === "FAIL" || r.eligibility_verdict === "FAIL"
}
