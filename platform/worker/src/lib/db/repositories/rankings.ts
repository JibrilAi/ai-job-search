import type { Env } from "../../../types.js"
import { weightedScore, verdictForScore, type RawRankingResponse } from "../../ranking/schema.js"

export interface RankingRow {
  userId: string
  jobId: string
  status: string
  rankScore: number | null
  rankVerdict: string | null
  rankDate: string | null
  technicalScore: number | null
  experienceScore: number | null
  behavioralScore: number | null
  careerScore: number | null
  locationVerdict: string | null
  languageGate: string | null
  languageNote: string | null
  eligibilityVerdict: string | null
  strengths: string[]
  gaps: string[]
}

const SELECT_COLUMNS = `user_id as userId, job_id as jobId, status, rank_score as rankScore,
  rank_verdict as rankVerdict, rank_date as rankDate, technical_score as technicalScore,
  experience_score as experienceScore, behavioral_score as behavioralScore, career_score as careerScore,
  location_verdict as locationVerdict, language_gate as languageGate, language_note as languageNote,
  eligibility_verdict as eligibilityVerdict, strengths_json as strengthsJson, gaps_json as gapsJson`

interface RankingRowRaw extends Omit<RankingRow, "strengths" | "gaps"> {
  strengthsJson: string
  gapsJson: string
}

function toRankingRow(raw: RankingRowRaw): RankingRow {
  return {
    ...raw,
    strengths: raw.strengthsJson ? JSON.parse(raw.strengthsJson) : [],
    gaps: raw.gapsJson ? JSON.parse(raw.gapsJson) : [],
  }
}

export async function ensureRankingPlaceholder(env: Env, userId: string, jobId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_job_rankings (user_id, job_id, status) VALUES (?, ?, 'new')
     ON CONFLICT(user_id, job_id) DO NOTHING`,
  )
    .bind(userId, jobId)
    .run()
}

export async function saveRanking(
  env: Env,
  userId: string,
  jobId: string,
  result: RawRankingResponse,
  profileVersion: number,
): Promise<void> {
  const vetoed =
    result.location_verdict === "FAIL" || result.language_gate === "FAIL" || result.eligibility_verdict === "FAIL"
  const score = weightedScore(result.scores)
  const verdict = vetoed ? "Poor Fit (vetoed)" : verdictForScore(score)

  await env.DB.prepare(
    `INSERT INTO user_job_rankings (
       user_id, job_id, status, rank_score, rank_verdict, rank_date,
       technical_score, experience_score, behavioral_score, career_score,
       location_verdict, language_gate, language_note, eligibility_verdict,
       strengths_json, gaps_json, ranked_at_profile_version
     ) VALUES (?, ?, 'ranked', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, job_id) DO UPDATE SET
       status = 'ranked', rank_score = excluded.rank_score, rank_verdict = excluded.rank_verdict,
       rank_date = excluded.rank_date, technical_score = excluded.technical_score,
       experience_score = excluded.experience_score, behavioral_score = excluded.behavioral_score,
       career_score = excluded.career_score, location_verdict = excluded.location_verdict,
       language_gate = excluded.language_gate, language_note = excluded.language_note,
       eligibility_verdict = excluded.eligibility_verdict, strengths_json = excluded.strengths_json,
       gaps_json = excluded.gaps_json, ranked_at_profile_version = excluded.ranked_at_profile_version`,
  )
    .bind(
      userId,
      jobId,
      score,
      verdict,
      new Date().toISOString(),
      result.scores.technical,
      result.scores.experience,
      result.scores.behavioral,
      result.scores.career,
      result.location_verdict,
      result.language_gate,
      result.language_note,
      result.eligibility_verdict,
      JSON.stringify(result.strengths),
      JSON.stringify(result.gaps),
      profileVersion,
    )
    .run()
}

export async function listRankingsForUser(
  env: Env,
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<RankingRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLUMNS} FROM user_job_rankings
     WHERE user_id = ? AND status = 'ranked'
     ORDER BY rank_score DESC LIMIT ? OFFSET ?`,
  )
    .bind(userId, opts.limit ?? 50, opts.offset ?? 0)
    .all<RankingRowRaw>()
  return results.map(toRankingRow)
}

export async function getRanking(env: Env, userId: string, jobId: string): Promise<RankingRow | null> {
  const row = await env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM user_job_rankings WHERE user_id = ? AND job_id = ?`)
    .bind(userId, jobId)
    .first<RankingRowRaw>()
  return row ? toRankingRow(row) : null
}

export interface RankedJobFeedRow {
  jobId: string
  title: string
  company: string
  location: string | null
  sourceUrl: string
  deadline: string | null
  rankScore: number | null
  rankVerdict: string | null
  locationVerdict: string | null
  languageGate: string | null
}

/** The Job Feed's primary query: this user's ranked jobs, joined to job summaries, best-first. */
export async function listRankedJobFeedForUser(
  env: Env,
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<RankedJobFeedRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT j.id as jobId, j.title, j.company, j.location, j.source_url as sourceUrl, j.deadline,
            r.rank_score as rankScore, r.rank_verdict as rankVerdict,
            r.location_verdict as locationVerdict, r.language_gate as languageGate
     FROM user_job_rankings r
     JOIN jobs j ON j.id = r.job_id
     WHERE r.user_id = ? AND r.status = 'ranked' AND j.status = 'active'
     ORDER BY r.rank_score DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(userId, opts.limit ?? 50, opts.offset ?? 0)
    .all<RankedJobFeedRow>()
  return results
}
