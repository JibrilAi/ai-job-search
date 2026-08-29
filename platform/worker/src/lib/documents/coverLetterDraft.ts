import type { Env } from "../../types.js"
import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_MODEL = "claude-sonnet-5"

export interface CoverLetterContent {
  greeting: string
  opening: string
  body: string
  achievements: string[]
  connection: string
  personalFit: string
  closingLine: string
}

const SUBMIT_COVER_LETTER_TOOL = {
  name: "submit_cover_letter",
  description: "Submit the structured cover-letter draft.",
  input_schema: {
    type: "object",
    properties: {
      greeting: { type: "string" },
      opening: { type: "string" },
      body: { type: "string" },
      achievements: { type: "array", items: { type: "string" } },
      connection: { type: "string" },
      personalFit: { type: "string" },
      closingLine: { type: "string" },
    },
    required: ["greeting", "opening", "body", "achievements", "connection", "personalFit", "closingLine"],
  },
}

const SYSTEM_PROMPT = `You draft cover letters for a job search platform. Follow the structure of cover_letters/cover_example.tex exactly:
- greeting: "Dear Hiring Manager," (or a named contact if given).
- opening: 2-3 sentences naming the role, where it was found (a job board), and previewing fit.
- body: 1-2 sentences introducing the candidate's most relevant experience, framed toward the posting's tasks. Do not restate the achievements list inside this paragraph -- it is rendered separately as bullets.
- achievements: 3-5 short bullet points, each a concrete result mapped to a posting requirement. Never fabricate -- ground every claim in the candidate's actual experience/skills as given.
- connection: 1-2 sentences on why this company specifically, referencing only facts given in the job posting text (never invent company facts).
- personalFit: 2-3 sentences on behavioral strengths and team fit, drawn from the candidate's behavioral profile.
- closingLine: a single closing sentence (e.g. "I look forward to hearing from you.").
Write in a warm, direct, cliche-free voice. No em-dashes. Call the submit_cover_letter tool with your draft.`

function buildUserMessage(job: Pick<JobRow, "title" | "company" | "description">, profile: Profile): string {
  return `## Job Posting
Title: ${job.title}
Company: ${job.company}
Description:
${job.description ?? "(no description available)"}

## Candidate
Name: ${profile.name ?? "(not set)"}
Experience:
${profile.experience.map((e) => `- ${e.title} at ${e.company}: ${e.bullets.join(" ")}`).join("\n") || "(none listed)"}
Skills: ${[...profile.skills.primary, ...profile.skills.secondary].join(", ") || "(none listed)"}
Behavioral strengths: ${profile.behavioral.strengths || "(none listed)"}
Thrives in: ${profile.behavioral.idealEnvironment || "(not specified)"}`
}

export async function draftCoverLetter(
  env: Env,
  input: { job: Pick<JobRow, "title" | "company" | "description">; profile: Profile },
): Promise<CoverLetterContent> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserMessage(input.job, input.profile) }],
      tools: [SUBMIT_COVER_LETTER_TOOL],
      tool_choice: { type: "tool", name: "submit_cover_letter" },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Anthropic API request failed: ${response.status} ${body}`)
  }

  const data = (await response.json()) as { content: Array<{ type: string; name?: string; input?: unknown }> }
  const toolUse = data.content.find((block) => block.type === "tool_use" && block.name === "submit_cover_letter")
  if (!toolUse) throw new Error("Claude did not return a submit_cover_letter tool call")
  return toolUse.input as CoverLetterContent
}
