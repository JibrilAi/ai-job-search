import type { Env } from "../../types.js"
import type { ProfileInput } from "../db/repositories/profiles.js"
import { callLLM } from "../llmClient.js"

// Resumes are short; this bounds token usage against a malformed or
// unusually large PDF rather than truncating any real resume's content.
const MAX_RESUME_CHARS = 20_000

const SYSTEM_PROMPT = `You extract a structured candidate profile from resume text, for prefilling a job-search profile form. Only include information explicitly present in the text -- never invent employers, dates, skills, or achievements. Leave a field empty (empty string, empty array, or null) when the resume doesn't state it. A resume rarely states things like target sectors, deal-breakers, or energizing/draining tasks -- leave those empty unless genuinely explicit.`

const PROFILE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", nullable: true },
    city: { type: "STRING", nullable: true },
    country: { type: "STRING", nullable: true },
    commuteConstraints: { type: "STRING", nullable: true },
    cvLanguage: { type: "STRING", nullable: true },
    employmentStatus: { type: "STRING", nullable: true },
    linkedinHeadline: { type: "STRING", nullable: true },
    languages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { language: { type: "STRING" }, level: { type: "STRING" } },
        required: ["language", "level"],
      },
    },
    education: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          degree: { type: "STRING" },
          field: { type: "STRING" },
          yearStart: { type: "STRING" },
          yearEnd: { type: "STRING" },
          institution: { type: "STRING" },
          thesis: { type: "STRING" },
          topics: { type: "STRING" },
        },
        required: ["degree", "field", "institution"],
      },
    },
    experience: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          startDate: { type: "STRING" },
          endDate: { type: "STRING" },
          company: { type: "STRING" },
          location: { type: "STRING" },
          bullets: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "company", "bullets"],
      },
    },
    skills: {
      type: "OBJECT",
      properties: {
        primary: { type: "ARRAY", items: { type: "STRING" } },
        secondary: { type: "ARRAY", items: { type: "STRING" } },
        domain: { type: "ARRAY", items: { type: "STRING" } },
        software: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["primary", "secondary", "domain", "software"],
    },
    certifications: { type: "ARRAY", items: { type: "STRING" } },
    publications: { type: "ARRAY", items: { type: "STRING" } },
    awards: { type: "ARRAY", items: { type: "STRING" } },
    behavioral: {
      type: "OBJECT",
      properties: {
        traits: { type: "ARRAY", items: { type: "STRING" } },
        strengths: { type: "STRING" },
        growthAreas: { type: "STRING" },
        idealEnvironment: { type: "STRING" },
      },
      required: ["traits", "strengths", "growthAreas", "idealEnvironment"],
    },
    motivation: {
      type: "OBJECT",
      properties: {
        energizingTasks: { type: "ARRAY", items: { type: "STRING" } },
        drainingTasks: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["energizingTasks", "drainingTasks"],
    },
    targetSectors: { type: "ARRAY", items: { type: "STRING" } },
    dealbreakers: { type: "ARRAY", items: { type: "STRING" } },
    eligibility: {
      type: "OBJECT",
      properties: {
        citizenshipOrPr: { type: "STRING", nullable: true },
        visaConstraintsNote: { type: "STRING", nullable: true },
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

/** Defensive normalization of Gemini's response into a well-formed ProfileInput, tolerating a field the model omitted despite the schema. */
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
    // Not derivable from a resume PDF -- the frontend's merge always keeps
    // the form's existing value for these fields instead (ProfileSetup.tsx's
    // mergeProfile), this is just a placeholder to satisfy the type.
    autoApplyEnabled: false,
    autoSubmitMode: "off",
  }
}

export async function extractProfileFromResumeText(env: Env, resumeText: string): Promise<ProfileInput> {
  const text = resumeText.slice(0, MAX_RESUME_CHARS)

  const result = await callLLM(env, {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Resume text:\n\n${text}`,
    responseSchema: PROFILE_RESPONSE_SCHEMA,
    // This is the largest schema of any call site (the whole profile
    // shape: education/experience arrays, behavioral, motivation, etc.) --
    // widened from 4096 for the same reason field-suggestion's budget was
    // widened earlier: Gemini 3.x's mandatory thinkingConfig eats into
    // maxOutputTokens, and a tight budget here risks the same
    // truncated-mid-JSON failure already seen and fixed elsewhere.
    maxOutputTokens: 8192,
  })

  return normalizeExtractedProfile(result)
}
