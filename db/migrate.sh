#!/bin/sh
# Applies the schema once to an empty database. The compose "migrate" service runs this.
# Later schema changes will move to dbmate migrations; this covers the first version.
set -eu

applied=$(psql -tAc "select count(*) from information_schema.schemata where schema_name = 'ref'")
if [ "$applied" = "1" ]; then
  echo "schema already applied"
  exit 0
fi

psql -v ON_ERROR_STOP=1 -q -f /db/schema.sql -f /db/timescale.sql
echo "schema applied"
