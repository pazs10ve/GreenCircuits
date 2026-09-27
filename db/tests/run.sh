#!/bin/sh
# Builds the schema in a throwaway database and runs the smoke checks, leaving the
# development database untouched. Run: docker compose exec db sh /db/tests/run.sh
set -eu

export PGUSER="${POSTGRES_USER:-greencircuits}"
DB=gc_smoke

dropdb --if-exists "$DB"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

psql -d "$DB" -v ON_ERROR_STOP=1 -q -f /db/schema.sql -f /db/timescale.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -f /db/tests/smoke.sql
