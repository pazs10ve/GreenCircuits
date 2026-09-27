-- Accounts: email and password sign-in on top of the anonymous users, and
-- server-side sessions that can be revoked (ADR 0006).

-- scrypt, as "scrypt$N$r$p$salt$hash". NULL for anonymous users.
ALTER TABLE app.users ADD COLUMN password_hash text;
ALTER TABLE app.users ADD CONSTRAINT users_password_check CHECK (password_hash IS NULL OR NOT is_anonymous);

-- What the feed is tuned to: investing style and followed sectors.
ALTER TABLE app.users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- One row per signed-in browser. The cookie holds a random token; only its
-- SHA-256 is stored, so a leaked table can't be used to sign in.
CREATE TABLE app.session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  user_agent    text,
  ip            inet
);
CREATE INDEX session_user_idx ON app.session (user_id);
-- For the job that clears out expired sessions.
CREATE INDEX session_expiry_idx ON app.session (expires_at);
