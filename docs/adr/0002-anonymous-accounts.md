# 2. Anonymous accounts held by a signed cookie

- Date: 2026-09-27
- Status: accepted; the cookie part is replaced by [ADR 0006](0006-accounts-and-sessions.md), which moves visitors onto server-side sessions

## Context

Watchlists, alerts, holdings and backtests have to live on the server: the alert engine checks alerts on every tick, and backtests run on workers. So every visitor who saves something needs an owner row in `app.users`.

GreenCircuits is a portfolio project that people open from a link. Asking them to sign up before they can try the lab loses most of them. A real sign-in also brings email or SMS verification, account recovery and stored personal data, which cost money and time but don't show anything new.

## Decision

1. The first write, or `GET /v1/me`, creates an `app.users` row with `is_anonymous = true`. It sets a cookie, `gc_uid`, holding the row's id. The cookie is signed, httpOnly and `SameSite=Lax`, and lasts a year.
2. Reads never create users. Without a valid session they answer with empty lists.
3. The API trusts only a correctly signed cookie. An unsigned or forged value counts as no session. The cookie is signed with `SESSION_SECRET`, and the API refuses to start in production with the development default.
4. The web app calls `/me` first. It then syncs under a Web Lock, so tabs that open at the same moment share one account instead of each creating its own.
5. Migration 0001 relaxes the contact check. A user needs an email or phone number only when they are not anonymous.

## Consequences

- No passwords or personal data are stored.
- Signing up later can fill in an email or phone number on the same row, so a visitor's data carries over.
- Clearing cookies, or switching browser, loses the account. That is acceptable for a demo.
- Anyone can create accounts. Per-IP rate limits and per-user caps (20 watchlists, 100 alerts) bound the damage, and a cleanup job can delete anonymous users not seen for a while, using the partial index `users_anonymous_seen_idx`.
