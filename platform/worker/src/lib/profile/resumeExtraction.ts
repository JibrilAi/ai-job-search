import type { Env } from "../../types.js"
import type { ProfileInput } from "../db/repositories/profiles.js"
import { callLLM } from "../llmClient.js"
import { callGemini } from "../geminiClient.js"

// Resumes are short; this bounds token usage against a malformed or
// unusually large PDF rather than truncating any real resume's content.
const MAX_RESUME_CHARS = 20_000

const SYSTEM_PROMPT = `You extract a structured candidate profile from resume text, for prefilling a job-search profile form. Only include information explicitly present in the text -- never invent employers, dates, skills, or achievements. Leave a field empty (empty string, empty array, or null) when the resume doesn't state it. A resume rarely states things like target sectors, deal-breakers, energizing/draining tasks, notice period, salary expectation, relocation willingness, or work arrangement preference -- leave those empty unless genuinely explicit. portfolioUrl means a personal website, GitHub, or portfolio link (not the LinkedIn URL, which goes in linkedinHeadline's context, not here) -- only fill it if such a URL literally appears in the text. For experience entries: use the resume's literal date text for startDate/endDate; if a role is current/ongoing, endDate should be the word "Present", never blank or guessed. Keep company (the employer name) and location (city/region) separate even when the resume lists them together on one line (e.g. "Acme Inc. -- Toronto, ON") -- never put location text into company or vice versa. Split each role's bullets into one array element per distinct line the resume already delimits (by bullet character or line break), not one combined paragraph and not invented sub-splits. If someone held multiple distinct titles or date ranges at the same company (e.g. a promotion), emit one experience entry per title/date range rather than merging them into one.`

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
    noticePeriod: { type: "STRING", nullable: true },
    salaryExpectation: { type: "STRING", nullable: true },
    relocationWillingness: { type: "STRING", nullable: true },
    workArrangementPreference: { type: "STRING", nullable: true },
    portfolioUrl: { type: "STRING", nullable: true },
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
    "noticePeriod",
    "salaryExpectation",
    "relocationWillingness",
    "workArrangementPreference",
    "portfolioUrl",
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
// The schema declares bullets as an array of strings, but a free-tier
// model occasionally returns a single bullet as a bare string instead of
// a 1-element array -- strArray() would silently drop that content to []
// rather than keep it, so wrap a bare string before falling through.
function bulletsOf(v: unknown): string[] {
  return strArray(typeof v === "string" ? [v] : v)
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
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
    noticePeriod: strOrNull(v.noticePeriod),
    salaryExpectation: strOrNull(v.salaryExpectation),
    relocationWillingness: strOrNull(v.relocationWillingness),
    workArrangementPreference: strOrNull(v.workArrangementPreference),
    portfolioUrl: strOrNull(v.portfolioUrl),
    languages: Array.isArray(v.languages)
      ? v.languages.filter(isPlainObject).map((r) => ({ language: str(r.language), level: str(r.level) }))
      : [],
    education: Array.isArray(v.education)
      ? v.education.filter(isPlainObject).map((r) => ({
          degree: str(r.degree),
          field: str(r.field),
          yearStart: typeof r.yearStart === "string" ? r.yearStart : undefined,
          yearEnd: typeof r.yearEnd === "string" ? r.yearEnd : undefined,
          institution: str(r.institution),
          thesis: typeof r.thesis === "string" ? r.thesis : undefined,
          topics: typeof r.topics === "string" ? r.topics : undefined,
        }))
      : [],
    // Non-object elements (a garbled string/number/null the model
    // returned in place of a real entry) are dropped rather than coerced
    // into a blank placeholder row that would otherwise still occupy a
    // slot in the profile's experience list. An entry that ends up with
    // neither a title nor a company after normalization is dropped too --
    // it isn't a placeable row even if bullets picked up stray text.
    experience: Array.isArray(v.experience)
      ? v.experience
          .filter(isPlainObject)
          .map((r) => ({
            title: str(r.title),
            startDate: typeof r.startDate === "string" ? r.startDate : undefined,
            endDate: typeof r.endDate === "string" ? r.endDate : undefined,
            company: str(r.company),
            location: typeof r.location === "string" ? r.location : undefined,
            bullets: bulletsOf(r.bullets),
          }))
          .filter((e) => e.title.trim() || e.company.trim())
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

// A real resume should trip at least one of these -- if all four are
// empty, the extraction produced nothing usable, whether because the LLM
// genuinely found nothing or (the actual observed case) because
// OpenRouter's free-model pool returned technically-valid-but-wrong-shaped
// or empty JSON for this schema without throwing. This is by far the
// largest/most deeply nested schema of any call site (nested
// education/experience arrays of objects plus several sub-objects), which
// openRouterClient.ts's own comments already flag as the shape that free
// pool honors least reliably under strict structured output.
function isEmptyExtraction(profile: ProfileInput): boolean {
  return !profile.name && profile.experience.length === 0 && profile.education.length === 0 && profile.skills.primary.length === 0
}

// experience is the deepest/most schema-fragile part of PROFILE_RESPONSE_SCHEMA
// (see the file-level comment above isEmptyExtraction), so it's the field
// most likely to come back empty/garbled even when the rest of the
// extraction succeeded -- isEmptyExtraction's all-four-empty check misses
// that case entirely, since name/education/skills can all be fine while
// experience alone is not.
function experienceLooksEmpty(profile: ProfileInput): boolean {
  return profile.experience.length === 0
}

export async function extractProfileFromResumeText(env: Env, resumeText: string): Promise<ProfileInput> {
  const text = resumeText.slice(0, MAX_RESUME_CHARS)
  const args = {
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
  }

  const primary = normalizeExtractedProfile(await callLLM(env, args))

  if (isEmptyExtraction(primary)) {
    // callLLM's OpenRouter->Gemini fallback only triggers when OpenRouter
    // throws -- a parseable-but-empty/wrong-shaped response doesn't throw,
    // so it never reaches that fallback on its own. Retry directly against
    // Gemini here, the same recovery callLLM would have done had
    // OpenRouter actually failed loudly.
    console.warn("resume extraction: primary provider returned an empty profile, retrying directly against Gemini")
    const fallback = normalizeExtractedProfile(await callGemini(env, args))
    if (!isEmptyExtraction(fallback)) return fallback
    throw new Error("resume extraction produced no usable data from either provider")
  }

  if (experienceLooksEmpty(primary)) {
    // The rest of the extraction worked, so this isn't the "nothing came
    // back" case above -- just retry for experience specifically and keep
    // every other already-good field from primary. If Gemini's retry is
    // also empty, don't throw: a genuinely experience-free resume (e.g. a
    // new graduate) is a legitimate result, not a failure.
    console.warn("resume extraction: primary provider returned no experience entries though other fields succeeded, retrying directly against Gemini")
    const fallback = normalizeExtractedProfile(await callGemini(env, args))
    if (!experienceLooksEmpty(fallback)) return { ...primary, experience: fallback.experience }
  }

  return primary
}
