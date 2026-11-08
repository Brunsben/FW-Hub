#!/usr/bin/env bash
# Datenbank-Migrationen auf dem Server (Produktion).
#
# Aufruf (im Repo, z. B. ~/fw/FW-Hub):
#   scripts/server-migrate.sh              alle ausstehenden Migrationen
#   scripts/server-migrate.sh --bis 0012   nur bis einschließlich 0012
# Alle Argumente gehen unverändert an scripts/migrate.mjs.
#
# Was das Skript tut:
#   1. Baut das Migrations-Image (Dockerfile-Stage "migrate"). Dadurch fehlt nach
#      einem git pull nie eine neue Migration.
#   2. Liest POSTGRES_USER und POSTGRES_PASSWORD zur Laufzeit aus dem Container
#      fw_postgres. Das Passwort steht in keiner Datei und nicht in der
#      Befehlszeile (nur als Umgebungsvariable dieses Skripts und des
#      Migrations-Containers).
#   3. Startet einen kurzlebigen Container im Netz fw-network, kodiert Benutzer
#      und Passwort URL-konform und führt scripts/migrate.mjs gegen
#      fw_postgres:5432/fwhub aus.
#   4. Gibt danach die Zahl der Migrationen und der Policies im Schema core aus.
#
# Bewusst kein "docker compose run": Compose könnte sonst im falschen Projekt
# einen zweiten Postgres auf dasselbe Volume starten.
#
# Die Migrationsrolle ist die POSTGRES_USER-Rolle des Containers. Sie muss
# Eigentümerin der Tabellen sein (siehe .github/copilot-instructions.md).
#
# Für Tests gegen eine andere Datenbank lassen sich die Vorgaben per Umgebung
# überschreiben (FWHUB_IMAGE, FWHUB_NETZ, FWHUB_DB_CONTAINER, FWHUB_DB_HOST,
# FWHUB_DB_NAME). Auf dem Server ist das nicht nötig.
set -euo pipefail

IMAGE="${FWHUB_IMAGE:-fwhub-migrate}"
NETZ="${FWHUB_NETZ:-fw-network}"
DB_CONTAINER="${FWHUB_DB_CONTAINER:-fw_postgres}"
DB_HOST="${FWHUB_DB_HOST:-$DB_CONTAINER}"
DB_NAME="${FWHUB_DB_NAME:-fwhub}"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "== Migrations-Image bauen ($IMAGE)"
docker build --target migrate -t "$IMAGE" .

# Zugangsdaten nur als Umgebungsvariablen weiterreichen (-e NAME ohne Wert),
# damit sie nicht in der Prozessliste des Hosts erscheinen.
PGU="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)"
PGP="$(docker exec "$DB_CONTAINER" printenv POSTGRES_PASSWORD)"
export PGU PGP
export MIG_HOST="$DB_HOST" MIG_DB="$DB_NAME"

echo "== Migrationen anwenden (Argumente: ${*:-keine})"
rc=0
docker run --rm --network "$NETZ" \
  -e PGU -e PGP -e MIG_HOST -e MIG_DB \
  --entrypoint sh "$IMAGE" -c '
    U=$(node -p "encodeURIComponent(process.env.PGU)")
    P=$(node -p "encodeURIComponent(process.env.PGP)")
    export MIGRATE_DATABASE_URL="postgresql://$U:$P@$MIG_HOST:5432/$MIG_DB"
    exec node scripts/migrate.mjs "$@"' sh "$@" || rc=$?

echo "== Stand der Datenbank $DB_NAME"
docker exec "$DB_CONTAINER" psql -U "$PGU" -d "$DB_NAME" -At -F ': ' \
  -c "select 'Migrationen', count(*) from drizzle.__drizzle_migrations" \
  -c "select 'Policies in core', count(*) from pg_policies where schemaname = 'core'" \
  || echo "Stand konnte nicht gelesen werden" >&2

if [ "$rc" -ne 0 ]; then
  echo "FEHLER: Migration ist fehlgeschlagen (Exit-Code $rc)." >&2
fi
exit "$rc"
