import { z } from "zod"
import { SECTORS } from "@greencircuits/market/catalog"
import type { Sector } from "@greencircuits/market/types"

/**
 * Accounts: what sign-up and sign-in accept, what the API says about the
 * current user, and the preferences that tune the feed. The web app checks
 * passwords with the same rule the API enforces.
 */

export const Style = z.enum(["long_term", "trading", "both"])
export type Style = z.infer<typeof Style>

export const Preferences = z.object({
  /** Long-term investors see results, dividends and valuations first; traders see signals and moves first. */
  style: Style.default("both"),
  /** Sectors whose biggest movers join the feed. */
  sectors: z.array(z.enum(SECTORS as [Sector, ...Sector[]])).max(SECTORS.length).default([]),
})
export type Preferences = z.infer<typeof Preferences>

export const DEFAULT_PREFERENCES: Preferences = { style: "both", sectors: [] }

export interface PublicUser {
  id: string
  /** True until the visitor signs up; their data is kept either way. */
  anonymous: boolean
  email: string | null
  name: string | null
  createdAt: string
  preferences: Preferences
}

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "That doesn't look like an email address." }).max(254))

export const SignIn = z.object({ email: Email, password: z.string().min(1, "Enter your password.").max(128) })
export const SignUp = z.object({
  email: Email,
  password: z.string().max(128),
  name: z.string().trim().max(60).optional(),
})

// The passwords that top every breach list. Long enough to catch the obvious, short enough to ship.
const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "iloveyou", "11111111", "00000000", "abc12345", "admin123", "welcome1", "letmein1", "sunshine",
  "princess", "football", "baseball", "passw0rd", "p@ssw0rd", "india123", "greencircuits",
])

/** Why a password won't do, or null. Length matters more than symbols (NIST SP 800-63B). */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 8) return "Use at least 8 characters."
  if (password.length > 128) return "Use at most 128 characters."
  if (COMMON.has(password.toLowerCase())) return "That password is on every list of common ones. Pick another."
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "Don't use your email address as your password."
  return null
}
