#!/bin/sh
# Applies the base schema to an empty database, then any numbered migrations in
# db/migrations that haven't run yet, each in its own transaction. Safe to re-run.
# Runs anywhere psql can reach the database: the compose "migrate" service,
# docker compose exec db sh migrate.sh, or CI (sh db/migrate.sh with PG* set).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
export PGUSER="${PGUSER:-${POSTGRES_USER:-greencircuits}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-greencircuits}}"

applied=$(psql -tAc "select count(*) from information_schema.schemata where schema_name = 'ref'")
if [ "$applied" != "1" ]; then
  psql -v ON_ERROR_STOP=1 -q -o /dev/null -f "$here/schema.sql" -f "$here/timescale.sql"
  echo "base schema applied"
fi

psql -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS ops.schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"

for file in "$here"/migrations/*.sql; do
  [ -e "$file" ] || continue
  name=$(basename "$file")
  done_already=$(psql -tAc "select count(*) from ops.schema_migration where name = '$name'")
  [ "$done_already" = "1" ] && continue
  psql -v ON_ERROR_STOP=1 -q -1 -f "$file" -c "insert into ops.schema_migration (name) values ('$name')"
  echo "applied $name"
done
echo "schema up to date"
