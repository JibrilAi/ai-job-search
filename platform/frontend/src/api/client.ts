// Thin fetch client for the Worker API. Session auth is an httpOnly cookie
// (never touched from JS), so every call sends credentials and expects the
// Worker's CORS config (FRONTEND_ORIGIN) to allow this origin.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, (body && body.error) || `request failed: ${response.status}`)
  }
  return body as T
}

export interface CurrentUser {
  id: string
  email: string
}

export const authApi = {
  signup: (email: string, password: string) =>
    request<{ user: CurrentUser }>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ user: CurrentUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  magicLink: (email: string) => request<{ ok: boolean }>("/auth/magic-link", { method: "POST", body: JSON.stringify({ email }) }),
  verify: (token: string) => request<{ user: CurrentUser }>(`/auth/verify?token=${encodeURIComponent(token)}`),
  session: () => request<{ user: CurrentUser | null }>("/auth/session"),
}

// Mirrors worker/src/lib/db/repositories/profiles.ts's Profile shape.
export interface Profile {
  userId: string
  name: string | null
  city: string | null
  country: string | null
  commuteConstraints: string | null
  cvLanguage: string | null
  employmentStatus: string | null
  linkedinHeadline: string | null
  languages: { language: string; level: string }[]
  education: { degree: string; field: string; yearStart?: string; yearEnd?: string; institution: string; thesis?: string; topics?: string }[]
  experience: { title: string; startDate?: string; endDate?: string; company: string; location?: string; bullets: string[] }[]
  skills: { primary: string[]; secondary: string[]; domain: string[]; software: string[] }
  certifications: string[]
  publications: string[]
  awards: string[]
  behavioral: { traits: string[]; strengths: string; growthAreas: string; idealEnvironment: string }
  motivation: { energizingTasks: string[]; drainingTasks: string[] }
  targetSectors: string[]
  dealbreakers: string[]
  eligibility: { citizenshipOrPr: string | null; visaConstraintsNote: string | null }
  profileVersion: number
  updatedAt: string
}

export type ProfileInput = Omit<Profile, "userId" | "profileVersion" | "updatedAt">

export const profileApi = {
  get: () => request<{ profile: Profile | null }>("/profile"),
  save: (input: ProfileInput) => request<{ profile: Profile }>("/profile", { method: "PUT", body: JSON.stringify(input) }),
}

export interface JobSummary {
  id: string
  title: string
  company: string
  location: string | null
  sourceUrl: string
  description: string | null
  deadline: string | null
  portal: string
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

export interface Ranking {
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

export const jobsApi = {
  list: () => request<{ jobs: JobSummary[] }>("/jobs"),
  get: (id: string) => request<{ job: JobSummary; ranking: Ranking | null }>(`/jobs/${id}`),
}

export const rankingsApi = {
  feed: () => request<{ rankings: RankedJobFeedRow[] }>("/rankings"),
  reRank: (jobId: string) => request<{ ok: boolean; queued: boolean }>(`/rankings/${jobId}/re-rank`, { method: "POST" }),
}
