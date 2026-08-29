// Password hashing via the Web Crypto API (PBKDF2-SHA256). Workers has no
// native/libuv bindings, so bcrypt is not usable here -- PBKDF2 is built into
// Web Crypto with zero dependencies and is the pragmatic default. Revisit only
// if a security review calls for scrypt/argon2 via a vetted Workers-compatible
// WASM library.

const ITERATIONS = 210_000
const KEY_LENGTH_BITS = 256

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes.buffer as ArrayBuffer)
}

async function deriveKey(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(salt), iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS,
  )
  return toHex(derived)
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = generateSalt()
  const hash = await deriveKey(password, salt)
  return { hash, salt }
}

/** Constant-time-ish comparison: compares fixed-length hex digests byte-by-byte via XOR accumulation. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const candidate = await deriveKey(password, salt)
  return timingSafeEqual(candidate, hash)
}

export function isPasswordStrongEnough(password: string): boolean {
  return typeof password === "string" && password.length >= 8
}
