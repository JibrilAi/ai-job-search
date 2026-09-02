import type { Env } from "../../../types.js"

// Mirrors CLAUDE.md's Candidate Profile section -- this is the shape the AI
// ranking prompt (lib/ranking/prompt.ts) and the frontend's Profile Setup
// form both read/write.

export interface LanguageEntry {
  language: string
  level: string
}

export interface EducationEntry {
  degree: string
  field: string
  yearStart?: string
  yearEnd?: string
  institution: string
  thesis?: string
  topics?: string
}

export interface ExperienceEntry {
  title: string
  startDate?: string
  endDate?: string
  company: string
  location?: string
  bullets: string[]
}

export interface Skills {
  primary: string[]
  secondary: string[]
  domain: string[]
  software: string[]
}

export interface Behavioral {
  traits: string[]
  strengths: string
  growthAreas: string
  idealEnvironment: string
}

export interface Motivation {
  energizingTasks: string[]
  drainingTasks: string[]
}

export interface Eligibility {
  citizenshipOrPr: string | null
  visaConstraintsNote: string | null
}

// off: draft only (today's behavior). confirm: auto-fill the application
// and stop for the user to send. unattended: auto-fill AND submit with no
// human step. Only takes effect when autoApplyEnabled is also on, and
// only for freehire.me jobs -- see lib/documents/autoSubmit.ts.
export type AutoSubmitMode = "off" | "confirm" | "unattended"

export interface Profile {
  userId: string
  name: string | null
  city: string | null
  country: string | null
  commuteConstraints: string | null
  cvLanguage: string | null
  employmentStatus: string | null
  linkedinHeadline: string | null
  languages: LanguageEntry[]
  education: EducationEntry[]
  experience: ExperienceEntry[]
  skills: Skills
  certifications: string[]
  publications: string[]
  awards: string[]
  behavioral: Behavioral
  motivation: Motivation
  targetSectors: string[]
  dealbreakers: string[]
  eligibility: Eligibility
  // When true, a job that ranks Strong/Good Fit for this user gets a
  // tailored CV, cover letter, and a "drafted" application entry created
  // automatically -- see lib/documents/autoDraft.ts. Never auto-submits
  // anything to a job board.
  autoApplyEnabled: boolean
  autoSubmitMode: AutoSubmitMode
  profileVersion: number
  updatedAt: string
}

interface ProfileRow {
  userId: string
  name: string | null
  city: string | null
  country: string | null
  commuteConstraints: string | null
  cvLanguage: string | null
  employmentStatus: string | null
  linkedinHeadline: string | null
  languagesJson: string
  educationJson: string
  experienceJson: string
  skillsJson: string
  certificationsJson: string
  publicationsJson: string
  awardsJson: string
  behavioralJson: string
  motivationJson: string
  targetSectorsJson: string
  dealbreakersJson: string
  eligibilityJson: string
  autoApplyEnabled: number
  autoSubmitMode: string
  profileVersion: number
  updatedAt: string
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    userId: row.userId,
    name: row.name,
    city: row.city,
    country: row.country,
    commuteConstraints: row.commuteConstraints,
    cvLanguage: row.cvLanguage,
    employmentStatus: row.employmentStatus,
    linkedinHeadline: row.linkedinHeadline,
    languages: JSON.parse(row.languagesJson),
    education: JSON.parse(row.educationJson),
    experience: JSON.parse(row.experienceJson),
    skills: JSON.parse(row.skillsJson),
    certifications: JSON.parse(row.certificationsJson),
    publications: JSON.parse(row.publicationsJson),
    awards: JSON.parse(row.awardsJson),
    behavioral: JSON.parse(row.behavioralJson),
    motivation: JSON.parse(row.motivationJson),
    targetSectors: JSON.parse(row.targetSectorsJson),
    dealbreakers: JSON.parse(row.dealbreakersJson),
    eligibility: JSON.parse(row.eligibilityJson),
    autoApplyEnabled: !!row.autoApplyEnabled,
    autoSubmitMode: row.autoSubmitMode === "confirm" || row.autoSubmitMode === "unattended" ? row.autoSubmitMode : "off",
    profileVersion: row.profileVersion,
    updatedAt: row.updatedAt,
  }
}

export async function getProfile(env: Env, userId: string): Promise<Profile | null> {
  const row = await env.DB.prepare(
    `SELECT user_id as userId, name, city, country, commute_constraints as commuteConstraints,
            cv_language as cvLanguage, employment_status as employmentStatus,
            linkedin_headline as linkedinHeadline, languages_json as languagesJson,
            education_json as educationJson, experience_json as experienceJson,
            skills_json as skillsJson, certifications_json as certificationsJson,
            publications_json as publicationsJson, awards_json as awardsJson,
            behavioral_json as behavioralJson, motivation_json as motivationJson,
            target_sectors_json as targetSectorsJson, dealbreakers_json as dealbreakersJson,
            eligibility_json as eligibilityJson, auto_apply_enabled as autoApplyEnabled,
            auto_submit_mode as autoSubmitMode,
            profile_version as profileVersion, updated_at as updatedAt
     FROM profiles WHERE user_id = ?`,
  )
    .bind(userId)
    .first<ProfileRow>()
  return row ? rowToProfile(row) : null
}

export type ProfileInput = Omit<Profile, "userId" | "profileVersion" | "updatedAt">

/** Upserts a user's profile, bumping profile_version so stale AI rankings can be detected. */
export async function upsertProfile(env: Env, userId: string, input: ProfileInput): Promise<Profile> {
  const existing = await getProfile(env, userId)
  const nextVersion = existing ? existing.profileVersion + 1 : 1
  const updatedAt = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO profiles (
       user_id, name, city, country, commute_constraints, cv_language, employment_status,
       linkedin_headline, languages_json, education_json, experience_json, skills_json,
       certifications_json, publications_json, awards_json, behavioral_json, motivation_json,
       target_sectors_json, dealbreakers_json, eligibility_json, auto_apply_enabled,
       auto_submit_mode, profile_version, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       name = excluded.name, city = excluded.city, country = excluded.country,
       commute_constraints = excluded.commute_constraints, cv_language = excluded.cv_language,
       employment_status = excluded.employment_status, linkedin_headline = excluded.linkedin_headline,
       languages_json = excluded.languages_json, education_json = excluded.education_json,
       experience_json = excluded.experience_json, skills_json = excluded.skills_json,
       certifications_json = excluded.certifications_json, publications_json = excluded.publications_json,
       awards_json = excluded.awards_json, behavioral_json = excluded.behavioral_json,
       motivation_json = excluded.motivation_json, target_sectors_json = excluded.target_sectors_json,
       dealbreakers_json = excluded.dealbreakers_json, eligibility_json = excluded.eligibility_json,
       auto_apply_enabled = excluded.auto_apply_enabled, auto_submit_mode = excluded.auto_submit_mode,
       profile_version = excluded.profile_version, updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      input.name,
      input.city,
      input.country,
      input.commuteConstraints,
      input.cvLanguage,
      input.employmentStatus,
      input.linkedinHeadline,
      JSON.stringify(input.languages ?? []),
      JSON.stringify(input.education ?? []),
      JSON.stringify(input.experience ?? []),
      JSON.stringify(input.skills ?? { primary: [], secondary: [], domain: [], software: [] }),
      JSON.stringify(input.certifications ?? []),
      JSON.stringify(input.publications ?? []),
      JSON.stringify(input.awards ?? []),
      JSON.stringify(input.behavioral ?? { traits: [], strengths: "", growthAreas: "", idealEnvironment: "" }),
      JSON.stringify(input.motivation ?? { energizingTasks: [], drainingTasks: [] }),
      JSON.stringify(input.targetSectors ?? []),
      JSON.stringify(input.dealbreakers ?? []),
      JSON.stringify(input.eligibility ?? { citizenshipOrPr: null, visaConstraintsNote: null }),
      input.autoApplyEnabled ? 1 : 0,
      input.autoSubmitMode ?? "off",
      nextVersion,
      updatedAt,
    )
    .run()

  const saved = await getProfile(env, userId)
  if (!saved) throw new Error("profile upsert failed to persist")
  return saved
}

/** All users with a saved profile -- used to fan out ranking work for newly-scraped jobs. */
export async function listUserIdsWithProfile(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT user_id as userId FROM profiles`).all<{ userId: string }>()
  return results.map((r) => r.userId)
}
