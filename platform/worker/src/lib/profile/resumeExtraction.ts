import type { Env } from "../../types.js"
import type { ProfileInput } from "../db/repositories/profiles.js"

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_MODEL = "claude-sonnet-5"

// Resumes are short; this bounds token usage against a malformed or
// unusually large PDF rather than truncating any real resume's content.
const MAX_RESUME_CHARS = 20_000

const SYSTEM_PROMPT = `You extract a structured candidate profile from resume text, for prefilling a job-search profile form. Only include information explicitly present in the text -- never invent employers, dates, skills, or achievements. Leave a field empty (empty string, empty array, or null) when the resume doesn't state it. A resume rarely states things like target sectors, deal-breakers, or energizing/draining tasks -- leave those empty unless genuinely explicit.`

const SUBMIT_PROFILE_TOOL = {
  name: "submit_profile",
  description: "Submit the structured candidate profile extracted from the resume.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: ["string", "null"] },
      city: { type: ["string", "null"] },
      country: { type: ["string", "null"] },
      commuteConstraints: { type: ["string", "null"] },
      cvLanguage: { type: ["string", "null"] },
      employmentStatus: { type: ["string", "null"] },
      linkedinHeadline: { type: ["string", "null"] },
      languages: {
        type: "array",
        items: {
          type: "object",
          properties: { language: { type: "string" }, level: { type: "string" } },
          required: ["language", "level"],
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree: { type: "string" },
            field: { type: "string" },
            yearStart: { type: "string" },
            yearEnd: { type: "string" },
            institution: { type: "string" },
            thesis: { type: "string" },
            topics: { type: "string" },
          },
          required: ["degree", "field", "institution"],
        },
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["title", "company", "bullets"],
        },
      },
      skills: {
        type: "object",
        properties: {
          primary: { type: "array", items: { type: "string" } },
          secondary: { type: "array", items: { type: "string" } },
          domain: { type: "array", items: { type: "string" } },
          software: { type: "array", items: { type: "string" } },
        },
        required: ["primary", "secondary", "domain", "software"],
      },
      certifications: { type: "array", items: { type: "string" } },
      publications: { type: "array", items: { type: "string" } },
      awards: { type: "array", items: { type: "string" } },
      behavioral: {
        type: "object",
        properties: {
          traits: { type: "array", items: { type: "string" } },
          strengths: { type: "string" },
          growthAreas: { type: "string" },
          idealEnvironment: { type: "string" },
        },
        required: ["traits", "strengths", "growthAreas", "idealEnvironment"],
      },
      motivation: {
        type: "object",
        properties: {
          energizingTasks: { type: "array", items: { type: "string" } },
          drainingTasks: { type: "array", items: { type: "string" } },
        },
        required: ["energizingTasks", "drainingTasks"],
      },
      targetSectors: { type: "array", items: { type: "string" } },
      dealbreakers: { type: "array", items: { type: "string" } },
      eligibility: {
        type: "object",
        properties: {
          citizenshipOrPr: { type: ["string", "null"] },
          visaConstraintsNote: { type: ["string", "null"] },
        },
        required: ["citizenshipOrPr", "visaConstraintsNote"],
      },
    },
    required: [
      "name",
      "city",
      "country",
      "commuteConstraints",
      "cvLanguage",
      "employmentStatus",
      "linkedinHeadline",
      "languages",
      "education",
      "experience",
      "skills",
      "certifications",
      "publications",
      "awards",
      "behavioral",
      "motivation",
      "targetSectors",
      "dealbreakers",
      "eligibility",
    ],
  },
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

/** Defensive normalization of Claude's tool_use.input into a well-formed ProfileInput, tolerating a field the model omitted despite the schema. */
export function normalizeExtractedProfile(value: unknown): ProfileInput {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>
  const skills = (typeof v.skills === "object" && v.skills !== null ? v.skills : {}) as Record<string, unknown>
  const behavioral = (typeof v.behavioral === "object" && v.behavioral !== null ? v.behavioral : {}) as Record<string, unknown>
  const motivation = (typeof v.motivation === "object" && v.motivation !== null ? v.motivation : {}) as Record<string, unknown>
  const eligibility = (typeof v.eligibility === "object" && v.eligibility !== null ? v.eligibility : {}) as Record<string, unknown>

  return {
    name: strOrNull(v.name),
    city: strOrNull(v.city),
    country: strOrNull(v.country),
    commuteConstraints: strOrNull(v.commuteConstraints),
    cvLanguage: strOrNull(v.cvLanguage),
    employmentStatus: strOrNull(v.employmentStatus),
    linkedinHeadline: strOrNull(v.linkedinHeadline),
    languages: Array.isArray(v.languages)
      ? v.languages.map((l) => ({ language: str((l as Record<string, unknown>)?.language), level: str((l as Record<string, unknown>)?.level) }))
      : [],
    education: Array.isArray(v.education)
      ? v.education.map((e) => {
          const r = e as Record<string, unknown>
          return {
            degree: str(r?.degree),
            field: str(r?.field),
            yearStart: typeof r?.yearStart === "string" ? r.yearStart : undefined,
            yearEnd: typeof r?.yearEnd === "string" ? r.yearEnd : undefined,
            institution: str(r?.institution),
            thesis: typeof r?.thesis === "string" ? r.thesis : undefined,
            topics: typeof r?.topics === "string" ? r.topics : undefined,
          }
        })
      : [],
    experience: Array.isArray(v.experience)
      ? v.experience.map((e) => {
          const r = e as Record<string, unknown>
          return {
            title: str(r?.title),
            startDate: typeof r?.startDate === "string" ? r.startDate : undefined,
            endDate: typeof r?.endDate === "string" ? r.endDate : undefined,
            company: str(r?.company),
            location: typeof r?.location === "string" ? r.location : undefined,
            bullets: strArray(r?.bullets),
          }
        })
      : [],
    skills: {
      primary: strArray(skills.primary),
      secondary: strArray(skills.secondary),
      domain: strArray(skills.domain),
      software: strArray(skills.software),
    },
    certifications: strArray(v.certifications),
    publications: strArray(v.publications),
    awards: strArray(v.awards),
    behavioral: {
      traits: strArray(behavioral.traits),
      strengths: str(behavioral.strengths),
      growthAreas: str(behavioral.growthAreas),
      idealEnvironment: str(behavioral.idealEnvironment),
    },
    motivation: {
      energizingTasks: strArray(motivation.energizingTasks),
      drainingTasks: strArray(motivation.drainingTasks),
    },
    targetSectors: strArray(v.targetSectors),
    dealbreakers: strArray(v.dealbreakers),
    eligibility: {
      citizenshipOrPr: strOrNull(eligibility.citizenshipOrPr),
      visaConstraintsNote: strOrNull(eligibility.visaConstraintsNote),
    },
  }
}

export async function extractProfileFromResumeText(env: Env, resumeText: string): Promise<ProfileInput> {
  const text = resumeText.slice(0, MAX_RESUME_CHARS)

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Resume text:\n\n${text}` }],
      tools: [SUBMIT_PROFILE_TOOL],
      tool_choice: { type: "tool", name: "submit_profile" },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Anthropic API request failed: ${response.status} ${body}`)
  }

  const data = (await response.json()) as { content: Array<{ type: string; name?: string; input?: unknown }> }
  const toolUse = data.content.find((block) => block.type === "tool_use" && block.name === "submit_profile")
  if (!toolUse) throw new Error("Claude did not return a submit_profile tool call")

  return normalizeExtractedProfile(toolUse.input)
}
