#!/usr/bin/env bash
# Runs schema.sql + fitswap.sql + fitswap_test.sql against a throwaway local Postgres (needs Postgres
# binaries on PATH, e.g. `brew install postgresql@15`). Nothing outside a temp dir is touched.
set -euo pipefail
export LC_ALL=en_US.UTF-8
cd "$(dirname "$0")/../.."
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-54329}
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

$PSQL -d postgres -c "create database app" >/dev/null
# Minimal stand-in for Supabase's auth schema and roles.
$PSQL -d app <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
$PSQL -d app -f supabase/schema.sql >/dev/null
$PSQL -d app -f supabase/fitswap.sql >/dev/null
$PSQL -d app -f supabase/fitswap.sql >/dev/null   # must be re-runnable
$PSQL -d app -f supabase/tests/fitswap_test.sql 2>&1 | grep -E "ok -|FAIL|ERROR|PASSED|DETAIL|CONTEXT" || true
