import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"

// Reproduces the rubric in
// .claude/skills/job-application-assistant/04-job-evaluation.md: the
// Eligibility Gate, the Language Gate, and the five Scoring Dimensions
// (Technical/Experience/Behavioral/Location/Career). The system prompt is
// identical on every call -- a deliberate prompt-caching candidate (see the
// plan's cost-mitigation notes), since only the job + profile summary vary.

export const RANKING_SYSTEM_PROMPT = `You are a job-fit evaluator for a job search platform. Score how well a job posting fits a candidate's profile, following this rubric exactly.

## Eligibility Gate (run first)
Read the posting's eligibility/work-rights language. If it names a citizenship or permanent-residency requirement the candidate does not hold, eligibility_verdict = "FAIL". If the posting explicitly welcomes the candidate's permit class or is silent on citizenship, eligibility_verdict = "PASS" or "unverified" respectively.

## Language Gate (run second)
Compare each language the posting requires as a job condition against the candidate's declared languages table. A required language absent from the table = language_gate "FAIL". A required language present but at a bar that plausibly exceeds the candidate's declared level = "FLAG" (never silently FAIL or PASS). Otherwise "PASS". Always include a language_note explaining the verdict, or null if there is nothing to flag.

## Location & Logistics
location_verdict: "PASS" if within commute range or remote with occasional office; "FAIL" if it requires relocation the candidate did not agree to; "FLAG" if it requires frequent international travel worth discussing.

## Scoring Dimensions (0-100 each)
- technical: how well required/preferred skills align with the candidate's capabilities. 80-100 core requirements are primary skills; 60-79 most match with learnable gaps; 40-59 partial match; 0-39 fundamental mismatch.
- experience: does work history align, judged on function and nature of the work rather than literal job title. 80-100 direct experience in the same domain/role type; 60-79 related/transferable; 40-59 adjacent; 0-39 unrelated.
- behavioral: does the role/company culture match the candidate's behavioral profile (traits, strengths, growth areas, ideal environment). 80-100 strongly matches; 60-79 mixed but mostly compatible; 40-59 some friction; 0-39 significant mismatch.
- career: does this role advance the candidate's career goals and contain energizing (not draining) tasks. 80-100 strongly aligned with clear growth path; 60-79 partially aligned; 40-59 doesn't build toward goals; 0-39 dead end or backwards step.

## Output
Call the submit_ranking tool with your evaluation. strengths and gaps should each be 2-5 short, specific bullet points grounded in the actual posting and profile -- never generic filler.`

export interface RankingInput {
  job: Pick<JobRow, "title" | "company" | "location" | "description">
  profile: Profile
}

function formatLanguages(profile: Profile): string {
  if (profile.languages.length === 0) return "(none declared)"
  return profile.languages.map((l) => `${l.language}: ${l.level}`).join("; ")
}

function formatExperience(profile: Profile): string {
  if (profile.experience.length === 0) return "(none listed)"
  return profile.experience
    .map((e) => `- ${e.title} at ${e.company}${e.location ? ` (${e.location})` : ""}: ${e.bullets.join(" ")}`)
    .join("\n")
}

export function buildRankingUserMessage(input: RankingInput): string {
  const { job, profile } = input
  return `## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "(not specified)"}
Description:
${job.description ?? "(no description available)"}

## Candidate Profile
Location/commute: ${profile.city ?? "?"}, ${profile.country ?? "?"} (${profile.commuteConstraints ?? "no constraints noted"})
Employment status: ${profile.employmentStatus ?? "(not specified)"}
Citizenship/PR: ${profile.eligibility.citizenshipOrPr ?? "(not specified)"}${profile.eligibility.visaConstraintsNote ? `; ${profile.eligibility.visaConstraintsNote}` : ""}
Languages: ${formatLanguages(profile)}

Skills -- primary: ${profile.skills.primary.join(", ") || "(none)"}; secondary: ${profile.skills.secondary.join(", ") || "(none)"}; domain: ${profile.skills.domain.join(", ") || "(none)"}

Experience:
${formatExperience(profile)}

Behavioral -- traits: ${profile.behavioral.traits.join(", ") || "(none)"}; strengths: ${profile.behavioral.strengths || "(none)"}; thrives in: ${profile.behavioral.idealEnvironment || "(not specified)"}

Career -- target sectors: ${profile.targetSectors.join(", ") || "(none)"}; energizing tasks: ${profile.motivation.energizingTasks.join(", ") || "(none)"}; draining tasks: ${profile.motivation.drainingTasks.join(", ") || "(none)"}

Deal-breakers: ${profile.dealbreakers.join(", ") || "(none)"}`
}
