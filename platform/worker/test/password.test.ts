import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword, isPasswordStrongEnough } from "../src/lib/auth/password.js"

describe("password hashing", () => {
  it("hashes and verifies a correct password", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple")
    expect(await verifyPassword("correct horse battery staple", hash, salt)).toBe(true)
  })

  it("rejects an incorrect password", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple")
    expect(await verifyPassword("wrong password", hash, salt)).toBe(false)
  })

  it("produces different salts for the same password", async () => {
    const a = await hashPassword("same password")
    const b = await hashPassword("same password")
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it("enforces a minimum password length", () => {
    expect(isPasswordStrongEnough("short")).toBe(false)
    expect(isPasswordStrongEnough("longenough1")).toBe(true)
  })
})
