import type { Env } from "../../../types.js"

export interface UserRow {
  id: string
  email: string
  passwordHash: string | null
  passwordSalt: string | null
  emailVerified: number
  createdAt: string
}

export async function findUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT id, email, password_hash as passwordHash, password_salt as passwordSalt,
            email_verified as emailVerified, created_at as createdAt
     FROM users WHERE email = ?`,
  )
    .bind(email.trim().toLowerCase())
    .first<UserRow>()
}

export async function findUserById(env: Env, id: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT id, email, password_hash as passwordHash, password_salt as passwordSalt,
            email_verified as emailVerified, created_at as createdAt
     FROM users WHERE id = ?`,
  )
    .bind(id)
    .first<UserRow>()
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
