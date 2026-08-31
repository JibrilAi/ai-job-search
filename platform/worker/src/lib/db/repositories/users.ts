import type { Env } from "../../../types.js"

export type UserRole = "user" | "admin"

export interface UserRow {
  id: string
  email: string
  passwordHash: string | null
  passwordSalt: string | null
  emailVerified: number
  role: UserRole
  createdAt: string
}

const SELECT_FIELDS = `id, email, password_hash as passwordHash, password_salt as passwordSalt,
            email_verified as emailVerified, role, created_at as createdAt`

export async function findUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare(`SELECT ${SELECT_FIELDS} FROM users WHERE email = ?`)
    .bind(email.trim().toLowerCase())
    .first<UserRow>()
}

export async function findUserById(env: Env, id: string): Promise<UserRow | null> {
  return env.DB.prepare(`SELECT ${SELECT_FIELDS} FROM users WHERE id = ?`).bind(id).first<UserRow>()
}

export async function createUser(
  env: Env,
  params: { email: string; passwordHash?: string | null; passwordSalt?: string | null; emailVerified?: boolean },
): Promise<UserRow> {
  const id = crypto.randomUUID()
  const email = params.email.trim().toLowerCase()
  const createdAt = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, email_verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, params.passwordHash ?? null, params.passwordSalt ?? null, params.emailVerified ? 1 : 0, createdAt)
    .run()
  return {
    id,
    email,
    passwordHash: params.passwordHash ?? null,
    passwordSalt: params.passwordSalt ?? null,
    emailVerified: params.emailVerified ? 1 : 0,
    role: "user",
    createdAt,
  }
}

export async function markEmailVerified(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(userId).run()
}

export async function updatePassword(env: Env, userId: string, passwordHash: string, passwordSalt: string): Promise<void> {
  await env.DB.prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`)
    .bind(passwordHash, passwordSalt, userId)
    .run()
}

export interface AdminUserRow extends UserRow {
  profileSaved: number
}

export async function listUsers(env: Env): Promise<AdminUserRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash as passwordHash, u.password_salt as passwordSalt,
            u.email_verified as emailVerified, u.role, u.created_at as createdAt,
            CASE WHEN p.user_id IS NULL THEN 0 ELSE 1 END as profileSaved
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     ORDER BY u.created_at DESC`,
  ).all<AdminUserRow>()
  return results
}

export async function countUsers(env: Env): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) as count FROM users`).first<{ count: number }>()
  return row?.count ?? 0
}

export async function countAdmins(env: Env): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`).first<{ count: number }>()
  return row?.count ?? 0
}

export async function setUserRole(env: Env, userId: string, role: UserRole): Promise<void> {
  await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role, userId).run()
}

/**
 * Deletes a user and everything scoped to them. Written as explicit
 * per-table deletes (children before the parent) rather than relying on the
 * schema's ON DELETE CASCADE, since not every user-owned table declares one
 * (cv_templates/cover_letter_templates don't) and this needs to work
 * correctly regardless of whether D1 is enforcing FK constraints. Callers
 * are responsible for cleaning up R2 objects for this user's generated
 * documents first (this only touches D1) and for any admin-level safety
 * checks (self-delete, last-admin) before calling this.
 */
export async function deleteUser(env: Env, userId: string): Promise<void> {
  const statements = [
    "sessions",
    "generated_documents",
    "applications",
    "user_job_rankings",
    "scrape_queries",
  ].map((table) => {
    const column = table === "scrape_queries" ? "owner_user_id" : "user_id"
    return env.DB.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).bind(userId)
  })
  statements.push(
    env.DB.prepare(`DELETE FROM cv_templates WHERE owner_user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM cover_letter_templates WHERE owner_user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM profiles WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  )
  await env.DB.batch(statements)
}
