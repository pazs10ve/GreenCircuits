-- Anonymous accounts. Every visitor gets a real user row, so watchlists,
-- alerts, portfolios and backtests live in Postgres from the first click.
-- Signing up later fills in email or phone on the same row and keeps the id.
ALTER TABLE app.users ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE app.users DROP CONSTRAINT users_check;
ALTER TABLE app.users ADD CONSTRAINT users_contact_check
  CHECK (is_anonymous OR email IS NOT NULL OR phone_e164 IS NOT NULL);
-- For the job that removes anonymous users who never came back.
CREATE INDEX users_anonymous_seen_idx ON app.users (last_seen_at) WHERE is_anonymous;
