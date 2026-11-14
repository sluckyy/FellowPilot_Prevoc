#!/usr/bin/env bash
# Apply pending migrations and ensure the web app's least-privilege login exists.
#
#   ADMIN_DATABASE_URL=postgresql://admin:pw@host:5432/mcqcoach?sslmode=require \
#   APP_DB_PASSWORD=...  db/migrate.sh
#
# Each migration file runs once, in name order, inside its own transaction (the files contain
# BEGIN/COMMIT). The app connects as mcq_web, a member of mcq_app, which can insert events but
# never update or delete them.
set -euo pipefail
: "${ADMIN_DATABASE_URL:?set ADMIN_DATABASE_URL}"
: "${APP_DB_PASSWORD:?set APP_DB_PASSWORD}"
here="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -q -At)

applied() {
  "${PSQL[@]}" -c "SELECT to_regclass('public.schema_migrations') IS NOT NULL" | grep -q t \
    && "${PSQL[@]}" -c "SELECT version FROM schema_migrations" || true
}
done_list="$(applied)"

for f in "$here"/migrations/*.sql; do
  v="$(basename "$f" .sql)"
  if grep -qx "$v" <<<"$done_list"; then
    echo "skip   $v"
  else
    echo "apply  $v"
    "${PSQL[@]}" -f "$f"
    # Migrations after 001 record themselves here (001 creates the table and records itself).
    "${PSQL[@]}" -c "INSERT INTO schema_migrations (version) VALUES ('$v') ON CONFLICT DO NOTHING"
  fi
done

# Least-privilege login for the web app (password rotates on every deploy).
"${PSQL[@]}" -v pw="$APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE mcq_web LOGIN PASSWORD %L IN ROLE mcq_app', :'pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcq_web') \gexec
SELECT format('ALTER ROLE mcq_web WITH LOGIN PASSWORD %L', :'pw') \gexec
GRANT mcq_app TO mcq_web;
-- Event partitions for this month and the next twelve (the app also tops them up).
SELECT ensure_event_partition((date_trunc('month', now()) + make_interval(months => m))::date)
  FROM generate_series(0, 12) m;
SQL
echo "migrations complete"
