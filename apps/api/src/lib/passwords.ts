import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

/**
 * Password hashing with scrypt (memory-hard; in Node's standard library, so no
 * native module to build). Stored as "scrypt$N$r$p$salt$key" so the cost can
 * be raised later without breaking existing hashes.
 */

const COST = { N: 2 ** 15, r: 8, p: 1 }
const KEY_LENGTH = 64
const maxmem = (o: { N: number; r: number }) => 256 * o.N * o.r // twice what scrypt needs

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    // NFKC, so the same password typed on different keyboards hashes the same.
    scrypt(password.normalize("NFKC"), salt, length, options, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, KEY_LENGTH, { ...COST, maxmem: maxmem(COST) })
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), key.toString("base64url")].join("$")
}

/**
 * Checks a password in constant time. With no stored hash (an unknown email) it still does
 * the work of one, so response times don't reveal which emails have accounts.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split("$")
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") {
    await hashPassword(password)
    return false
  }
  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string]
  const cost = { N: Number(n), r: Number(r), p: Number(p) }
  const expected = Buffer.from(key, "base64url")
  const actual = await derive(password, Buffer.from(salt, "base64url"), expected.length, { ...cost, maxmem: maxmem(cost) })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
