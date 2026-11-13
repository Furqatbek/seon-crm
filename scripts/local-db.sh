#!/usr/bin/env bash
# Rebuilds a throwaway local database with the migrations and the seed, for
# running the permission tests without touching a Supabase project.
#
#   LOCAL_PG_URL=postgres://postgres:postgres@localhost:5432 scripts/local-db.sh
#   SUPABASE_DB_URL=$LOCAL_PG_URL/edu_crm_test npm test
#
# It only ever talks to LOCAL_PG_URL and refuses any host that is not local.
set -euo pipefail

cd "$(dirname "$0")/.."
SERVER="${LOCAL_PG_URL:-postgres://postgres:postgres@localhost:5432}"
DB="edu_crm_test"

case "$SERVER" in
  *@localhost:* | *@127.0.0.1:* | *@localhost | *@127.0.0.1) ;;
  *) echo "local-db.sh: LOCAL_PG_URL must point at localhost" >&2; exit 1 ;;
esac

psql "$SERVER/postgres" -v ON_ERROR_STOP=1 -q \
  -c "drop database if exists $DB with (force)" -c "create database $DB"

run() { psql "$SERVER/$DB" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; echo "applied $1"; }

run supabase/tests/supabase-stub.sql
for migration in supabase/migrations/*.sql; do run "$migration"; done
run supabase/seed.sql
