#!/usr/bin/env bash
# Lokale Wiederherstellung eines Dumps in eine NEUE Datenbank (Entwicklung,
# Restore-Test). Die laufende Datenbank (PGDATABASE aus der URL) wird nie
# überschrieben.
#
#   scripts/db-restore.sh <dump> <zieldatenbank> [--aufraeumen]
#
# - Zieldatenbank darf noch nicht existieren und nicht die eigene sein.
# - pg_restore --exit-on-error in einer frischen Datenbank (createdb).
#   Rollen (fw_app, fw_auth, Owner) stehen nicht im Dump und müssen im Cluster
#   existieren (lokal ja; neuer Server: drizzle/manual/create-fw-app-role.sql).
# - Danach Vergleich Quelle ↔ Ziel: Migrationen, Kameraden, Benutzer, Policies
#   in core und dienstplan, Pläne, Termine. Exit 1 bei Abweichung.
# - --aufraeumen löscht die Zieldatenbank nach dem Vergleich wieder.
# Verbindung wie scripts/db-backup.sh (nur lokale Hosts).
set -euo pipefail
cd "$(dirname "$0")/.."

[ $# -ge 2 ] || { sed -n '2,17p' "$0"; exit 2; }
dump="$1"; zieldb="$2"; aufraeumen="${3:-}"
[ -s "$dump" ] || { echo "Dump nicht gefunden oder leer: $dump" >&2; exit 2; }
[[ "$zieldb" =~ ^[a-z0-9_]+$ ]] || { echo "Zieldatenbank: nur a-z, 0-9 und _" >&2; exit 2; }
[ -z "$aufraeumen" ] || [ "$aufraeumen" = "--aufraeumen" ] || { echo "Unbekanntes Argument: $aufraeumen" >&2; exit 2; }

umgebung="$(node scripts/lib/pg-umgebung.mjs)" || exit 2
eval "$umgebung"
unset umgebung
quelle="$PGDATABASE"
[ "$zieldb" != "$quelle" ] || { echo "Abbruch: Ziel ist die laufende Datenbank ($quelle). Nur in eine neue Datenbank wiederherstellen." >&2; exit 2; }
if psql -X -At -d postgres -c "select 1 from pg_database where datname = '$zieldb'" | grep -q 1; then
  echo "Abbruch: Datenbank $zieldb existiert schon (erst selbst prüfen und löschen)." >&2; exit 2
fi

createdb "$zieldb"
echo "Wiederherstellen in $zieldb …"
pg_restore --exit-on-error --no-password -d "$zieldb" "$dump"

zaehle() {
  psql -X -At -d "$1" \
    -c "select 'Migrationen', count(*) from drizzle.__drizzle_migrations" \
    -c "select 'Kameraden', count(*) from core.kameraden" \
    -c "select 'Benutzer', count(*) from core.benutzer" \
    -c "select 'Policies core', count(*) from pg_policies where schemaname = 'core'" \
    -c "select 'Policies dienstplan', count(*) from pg_policies where schemaname = 'dienstplan'" \
    -c "select 'Pläne', count(*) from dienstplan.plaene" \
    -c "select 'Termine', count(*) from dienstplan.termine" \
    -c "select 'Trigger', count(*) from pg_trigger where not tgisinternal"
}
# Die Zählung als Owner umgeht RLS (Owner lokal = Superuser); sie dient nur dem Vergleich.
a="$(zaehle "$quelle")"; b="$(zaehle "$zieldb")"
echo "Vergleich (Quelle $quelle | Ziel $zieldb):"
paste -d'|' <(echo "$a") <(echo "$b" | cut -d'|' -f2) | awk -F'|' '{ printf "  %-20s %8s %8s %s\n", $1, $2, $3, ($2==$3 ? "" : "ABWEICHUNG (Änderungen seit dem Dump?)") }'
status=0
[ "$a" = "$b" ] || status=1

if [ "$aufraeumen" = "--aufraeumen" ]; then
  dropdb "$zieldb"
  echo "Testdatenbank $zieldb wieder gelöscht."
fi
[ $status -eq 0 ] && echo "OK: Restore vollständig, Zahlen stimmen überein." || echo "WARNUNG: Zahlen weichen ab (siehe oben)." >&2
exit $status
