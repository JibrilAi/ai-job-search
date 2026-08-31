// Thin fetch client for the Worker API. Session auth is an httpOnly cookie
// (never touched from JS), so every call sends credentials and expects the
// Worker's CORS config (FRONTEND_ORIGIN) to allow this origin.
//
// In dev, requests go to the relative "/api" path, which vite.config.ts
// proxies to the local Worker. In production the frontend (Pages) and the
// Worker are separate deployments on separate domains, so a relative path
// would hit Pages' own origin and 404 -- VITE_API_BASE_URL (set as a Pages
// build-time environment variable) points requests at the deployed Worker's
// URL instead, e.g. https://ai-job-search-worker.<subdomain>.workers.dev/api.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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

// No Content-Type header here -- the browser must set its own multipart
// boundary for FormData, which request()'s hardcoded application/json would
// clobber.
async function requestFormData<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include", body: form })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, (body && body.error) || `request failed: ${response.status}`)
  }
  return body as T
}

export interface CurrentUser {
  id: string
  email: string
  role: "user" | "admin"
}

export const authApi = {
  signup: (email: string, password: string, turnstileToken?: string) =>
    request<{ user: CurrentUser }>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, turnstileToken }) }),
  login: (email: string, password: string, turnstileToken?: string) =>
    request<{ user: CurrentUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, turnstileToken }) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  magicLink: (email: string, turnstileToken?: string) =>
    request<{ ok: boolean }>("/auth/magic-link", { method: "POST", body: JSON.stringify({ email, turnstileToken }) }),
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
  autoApplyEnabled: boolean
  profileVersion: number
  updatedAt: string
}

export type ProfileInput = Omit<Profile, "userId" | "profileVersion" | "updatedAt">

export const profileApi = {
  get: () => request<{ profile: Profile | null }>("/profile"),
  save: (input: ProfileInput) => request<{ profile: Profile }>("/profile", { method: "PUT", body: JSON.stringify(input) }),
  importResume: (file: File) => {
    const form = new FormData()
    form.set("resume", file)
    return requestFormData<{ profile: ProfileInput }>("/profile/resume", form)
  },
  searchPreferences: () =>
    request<{
      suggestion: { query: string; location: string | null }
      saved: { query: string; location: string | null; enabled: boolean } | null
    }>("/profile/search-preferences"),
  saveSearchPreferences: (query: string, location: string | null) =>
    request<{ ok: boolean }>("/profile/search-preferences", {
      method: "PUT",
      body: JSON.stringify({ query, location, enabled: true }),
    }),
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
  feed: (includeVetoed?: boolean) =>
    request<{ rankings: RankedJobFeedRow[] }>(`/rankings${includeVetoed ? "?includeVetoed=true" : ""}`),
  reRank: (jobId: string) => request<{ ok: boolean; queued: boolean }>(`/rankings/${jobId}/re-rank`, { method: "POST" }),
}

export interface AtsReport {
  pageCount: number
  charCount: number
  warnings: string[]
  passed: boolean
}

export interface GeneratedDocument {
  id: string
  userId: string
  applicationId: string | null
  type: "cv" | "cover_letter"
  templateId: string
  r2Key: string
  atsVerified: number
  atsReportJson: string | null
  createdAt: string
}

export const documentsApi = {
  list: () => request<{ documents: GeneratedDocument[] }>("/documents"),
  generateCv: (jobId?: string, applicationId?: string) =>
    request<{ document: GeneratedDocument; atsReport: AtsReport }>("/documents/cv", {
      method: "POST",
      body: JSON.stringify({ jobId, applicationId }),
    }),
  generateCoverLetter: (jobId: string, applicationId?: string) =>
    request<{ document: GeneratedDocument; atsReport: AtsReport }>("/documents/cover-letter", {
      method: "POST",
      body: JSON.stringify({ jobId, applicationId }),
    }),
  downloadUrl: (id: string) => `${API_BASE}/documents/${id}/download`,
}

export type ApplicationStatus =
  | "drafted"
  | "applied"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "no_response"
  | "offer_declined"
  | "withdrawn"

export interface Application {
  id: string
  userId: string
  jobId: string | null
  date: string | null
  company: string
  sector: string | null
  role: string
  roleType: string | null
  channel: string | null
  status: ApplicationStatus
  contactPerson: string | null
  fitRating: string | null
  notes: string | null
  cvDocumentId: string | null
  coverLetterDocumentId: string | null
  source: string | null
  deadline: string | null
  createdAt: string
  updatedAt: string
}

export interface ApplicationInput {
  jobId?: string | null
  company: string
  role: string
  sector?: string | null
  roleType?: string | null
  channel?: string | null
  source?: string | null
  deadline?: string | null
}

export const applicationsApi = {
  list: () => request<{ applications: Application[] }>("/applications"),
  create: (input: ApplicationInput) => request<{ application: Application }>("/applications", { method: "POST", body: JSON.stringify(input) }),
  get: (id: string) => request<{ application: Application }>(`/applications/${id}`),
  updateStatus: (id: string, status: ApplicationStatus, note?: string) =>
    request<{ application: Application }>(`/applications/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    }),
}

export interface AdminStats {
  users: number
  jobs: number
  applications: number
  rankings: number
  documents: number
  scrapeQueries: number
}

export interface AdminUser {
  id: string
  email: string
  role: "user" | "admin"
  emailVerified: boolean
  profileSaved: boolean
  createdAt: string
}

export interface AdminApplication extends Application {
  userEmail: string
}

export const adminApi = {
  stats: () => request<{ stats: AdminStats }>("/admin/stats"),
  users: () => request<{ users: AdminUser[] }>("/admin/users"),
  setUserRole: (id: string, role: "user" | "admin") =>
    request<{ ok: boolean }>(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  applications: () => request<{ applications: AdminApplication[] }>("/admin/applications"),
}
