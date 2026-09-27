#!/bin/sh
# Builds the schema (base plus migrations) in a throwaway database and runs the
# smoke checks, leaving the development database untouched.
# Run: docker compose exec db sh tests/run.sh (or sh db/tests/run.sh with PG* set)
set -eu

here=$(cd "$(dirname "$0")" && pwd)
export PGUSER="${PGUSER:-${POSTGRES_USER:-greencircuits}}"
DB=gc_smoke

dropdb --if-exists "$DB"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

PGDATABASE="$DB" sh "$here/../migrate.sh" > /dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$here/smoke.sql"
