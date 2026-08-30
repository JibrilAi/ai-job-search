import type { Env } from "../../types.js"
import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_MODEL = "claude-sonnet-5"

export interface CvTailoring {
  profileStatement: string
  emphasizedSkills: string[]
}

const SUBMIT_TAILORING_TOOL = {
  name: "submit_cv_tailoring",
  description: "Submit the CV tailoring for this specific job posting.",
  input_schema: {
    type: "object",
    properties: {
      profileStatement: { type: "string" },
      emphasizedSkills: { type: "array", items: { type: "string" } },
    },
    required: ["profileStatement", "emphasizedSkills"],
  },
}

const SYSTEM_PROMPT = `You tailor a candidate's CV opening for one specific job posting, for a job-search platform.
- profileStatement: 2-3 sentences, third-person-free (no "I"/"the candidate"), summarizing fit for THIS role. Ground every claim only in the candidate's actual listed experience and skills -- never invent employers, titles, technologies, or achievements not given to you.
- emphasizedSkills: 4-8 skills to lead with on the CV, chosen ONLY from the candidate's own listed skills (primary/secondary/domain/software), ordered by relevance to this posting's requirements. Do not include a skill that isn't in the candidate's list.
Call the submit_cv_tailoring tool with your result.`

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
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserMessage(input.job, input.profile) }],
      tools: [SUBMIT_TAILORING_TOOL],
      tool_choice: { type: "tool", name: "submit_cv_tailoring" },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Anthropic API request failed: ${response.status} ${body}`)
  }

  const data = (await response.json()) as { content: Array<{ type: string; name?: string; input?: unknown }> }
  const toolUse = data.content.find((block) => block.type === "tool_use" && block.name === "submit_cv_tailoring")
  if (!toolUse) throw new Error("Claude did not return a submit_cv_tailoring tool call")

  const raw = toolUse.input as { profileStatement?: unknown; emphasizedSkills?: unknown }
  return {
    profileStatement: typeof raw.profileStatement === "string" ? raw.profileStatement : "",
    emphasizedSkills: keepOwnedSkills(Array.isArray(raw.emphasizedSkills) ? raw.emphasizedSkills.filter((s): s is string => typeof s === "string") : [], input.profile),
  }
}
