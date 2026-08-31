import type { Env } from "../../types.js"
import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"
import { callGemini } from "../geminiClient.js"

export interface CvTailoring {
  profileStatement: string
  emphasizedSkills: string[]
}

const TAILORING_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    profileStatement: { type: "STRING" },
    emphasizedSkills: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["profileStatement", "emphasizedSkills"],
}

const SYSTEM_PROMPT = `You tailor a candidate's CV opening for one specific job posting, for a job-search platform.
- profileStatement: 2-3 sentences, third-person-free (no "I"/"the candidate"), summarizing fit for THIS role. Ground every claim only in the candidate's actual listed experience and skills -- never invent employers, titles, technologies, or achievements not given to you.
- emphasizedSkills: 4-8 skills to lead with on the CV, chosen ONLY from the candidate's own listed skills (primary/secondary/domain/software), ordered by relevance to this posting's requirements. Do not include a skill that isn't in the candidate's list.
Respond as JSON matching the required schema.`

function buildUserMessage(job: Pick<JobRow, "title" | "company" | "description">, profile: Profile): string {
  const allSkills = [...profile.skills.primary, ...profile.skills.secondary, ...profile.skills.domain, ...profile.skills.software]
  return `## Job Posting
Title: ${job.title}
Company: ${job.company}
Description:
${job.description ?? "(no description available)"}

## Candidate
Experience:
${profile.experience.map((e) => `- ${e.title} at ${e.company}: ${e.bullets.join(" ")}`).join("\n") || "(none listed)"}
All listed skills (choose emphasizedSkills only from this list): ${allSkills.join(", ") || "(none listed)"}
Behavioral strengths: ${profile.behavioral.strengths || "(none listed)"}`
}

/** Case-insensitive filter to skills the profile actually lists, guarding against a fabricated or hallucinated skill making it onto the CV. */
export function keepOwnedSkills(emphasized: string[], profile: Profile): string[] {
  const owned = new Set(
    [...profile.skills.primary, ...profile.skills.secondary, ...profile.skills.domain, ...profile.skills.software].map((s) =>
      s.trim().toLowerCase(),
    ),
  )
  const seen = new Set<string>()
  const kept: string[] = []
  for (const skill of emphasized) {
    const key = skill.trim().toLowerCase()
    if (owned.has(key) && !seen.has(key)) {
      seen.add(key)
      kept.push(skill.trim())
    }
  }
  return kept
}

export async function draftCvTailoring(
  env: Env,
  input: { job: Pick<JobRow, "title" | "company" | "description">; profile: Profile },
): Promise<CvTailoring> {
  const result = (await callGemini(env, {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: buildUserMessage(input.job, input.profile),
    responseSchema: TAILORING_RESPONSE_SCHEMA,
    maxOutputTokens: 512,
  })) as { profileStatement?: unknown; emphasizedSkills?: unknown }

  return {
    profileStatement: typeof result.profileStatement === "string" ? result.profileStatement : "",
    emphasizedSkills: keepOwnedSkills(
      Array.isArray(result.emphasizedSkills) ? result.emphasizedSkills.filter((s): s is string => typeof s === "string") : [],
      input.profile,
    ),
  }
}
