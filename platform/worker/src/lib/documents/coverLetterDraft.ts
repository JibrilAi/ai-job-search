import type { Env } from "../../types.js"
import type { JobRow } from "../db/repositories/jobs.js"
import type { Profile } from "../db/repositories/profiles.js"
import { callLLM } from "../llmClient.js"

export interface CoverLetterContent {
  greeting: string
  opening: string
  body: string
  achievements: string[]
  connection: string
  personalFit: string
  closingLine: string
}

const COVER_LETTER_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    greeting: { type: "STRING" },
    opening: { type: "STRING" },
    body: { type: "STRING" },
    achievements: { type: "ARRAY", items: { type: "STRING" } },
    connection: { type: "STRING" },
    personalFit: { type: "STRING" },
    closingLine: { type: "STRING" },
  },
  required: ["greeting", "opening", "body", "achievements", "connection", "personalFit", "closingLine"],
}

const SYSTEM_PROMPT = `You draft cover letters for a job search platform. Follow the structure of cover_letters/cover_example.tex exactly:
- greeting: "Dear Hiring Manager," (or a named contact if given).
- opening: 2-3 sentences naming the role, where it was found (a job board), and previewing fit.
- body: 1-2 sentences introducing the candidate's most relevant experience, framed toward the posting's tasks. Do not restate the achievements list inside this paragraph -- it is rendered separately as bullets.
- achievements: 3-5 short bullet points, each a concrete result mapped to a posting requirement. Never fabricate -- ground every claim in the candidate's actual experience/skills as given.
- connection: 1-2 sentences on why this company specifically, referencing only facts given in the job posting text (never invent company facts).
- personalFit: 2-3 sentences on behavioral strengths and team fit, drawn from the candidate's behavioral profile.
- closingLine: a single closing sentence (e.g. "I look forward to hearing from you.").
Write in a warm, direct, cliche-free voice. No em-dashes. Respond as JSON matching the required schema.`

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
  return (await callLLM(env, {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: buildUserMessage(input.job, input.profile),
    responseSchema: COVER_LETTER_RESPONSE_SCHEMA,
    maxOutputTokens: 1024,
  })) as CoverLetterContent
}
