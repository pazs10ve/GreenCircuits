# 6. Email and password accounts on server-side sessions

- Date: 2026-09-27
- Status: accepted; replaces the signed user-id cookie from [ADR 0002](0002-anonymous-accounts.md)

## Context

Anonymous accounts (ADR 0002) keep a visitor's watchlists, alerts, holdings and tests in Postgres, but only for one browser. People want the same data on every device, and a feed tuned to how they invest.

The anonymous cookie held a signed user id. That can't be revoked: signing out, "sign out everywhere" and ending other sessions after a password change are all impossible with it.

The blueprint planned an auth library (Better Auth). Its anonymous-user plugin gives anonymous users placeholder emails, while ours have no email at all, and its session and account tables would sit beside `app.users` rather than build on it.

## Decision

Accounts are email and password, built on the existing users and a new `app.session` table (migration 0003).

- **Passwords** are hashed with scrypt (N=2^15, r=8), from Node's standard library, and compared in constant time. The stored hash records its own cost, so the cost can be raised later.
- **The password rule** is shared by the form and the API: at least 8 characters, not on a list of common passwords, and not the email.
- **Sessions** are random 32-byte tokens in an httpOnly, SameSite=Lax cookie (Secure in production). Postgres stores only each token's SHA-256.
  - Expiry slides forward with use: 30 days for an account, a year for an anonymous visitor.
  - Signing in replaces the token, so a token planted before sign-in is useless after it.
  - Signing out deletes the row. A password change deletes every other session.
- **Sign-up keeps everything:** the visitor's anonymous user becomes the account.
- **Signing in merges:** when someone signs in from a browser they used anonymously, what they made there joins the account:
  - watchlists with the same name are combined;
  - alerts, notifications and tests move over, with a strategy renamed if the account already uses its name;
  - holdings move only if the account has none, since two portfolios would count shares twice.
- **Guessing** is limited to 10 attempts a minute per IP and 5 wrong passwords per email in 15 minutes. A wrong email and a wrong password get the same answer, taking the same time.
- **Audit log:** sign-ups, sign-ins (including failed ones), sign-outs, password changes, exports and deletions go to `ops.audit_log`.
- **Your data:** people can download everything as JSON, and delete the account after re-entering their password. Deletion cascades through every table.
- **Old cookies:** a visitor with the old signed cookie is moved onto a session on their next request.
- **Demo mode:** accounts need the backend, so they exist only in live mode. With the backend off, everything stays in the browser.

## Consequences

- No third-party service is needed: no email provider, no OAuth app.
- Every authenticated request reads one session row. That's cheap at this scale; a Valkey cache in front of it is the next step if load tests say so.
- Email verification and password reset need an email provider, and aren't built. The `email_verified` column is ready for them.
- Signing in with Google or GitHub would add an `app.auth_identity` table next to `app.session`, without changing sessions.
