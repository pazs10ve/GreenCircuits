import { DEFAULT_PREFERENCES, Preferences, type PublicUser } from "@greencircuits/contracts/account"
import type { Db } from "@greencircuits/db"

/** What the API says about a user: never the password hash, never another user's data. */
const USER_COLUMNS = ["id", "is_anonymous", "email", "name", "created_at", "preferences"] as const

export async function publicUser(db: Db, id: string): Promise<PublicUser> {
  const u = await db.selectFrom("app.users").select(USER_COLUMNS).where("id", "=", id).executeTakeFirstOrThrow()
  const prefs = Preferences.safeParse(u.preferences)
  return {
    id: u.id,
    anonymous: u.is_anonymous,
    email: u.email,
    name: u.name,
    createdAt: u.created_at.toISOString(),
    preferences: prefs.success ? prefs.data : DEFAULT_PREFERENCES,
  }
}
