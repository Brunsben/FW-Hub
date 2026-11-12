#!/usr/bin/env bash
# Lokales Datenbank-Backup (Entwicklung): pg_dump im Custom-Format (-Fc) mit
# Zeitstempel im Dateinamen, z. B. backups/fwhub_dev_2026-11-12_101530.dump.
#
#   scripts/db-backup.sh [--ziel <verzeichnis>]
#
# Verbindung: BACKUP_DATABASE_URL, sonst MIGRATE_DATABASE_URL (Owner; aus der
# Umgebung oder .env.local). Nur lokale Hosts. Auf dem Server gilt
# scripts/server-backup.sh (Container fw_postgres, Aufbewahrung, Kopie).
# Ablauf: erst .tmp schreiben, mit pg_restore --list prüfen, dann umbenennen.
# Verzeichnis 700, Datei 600 (Dumps enthalten Personendaten und PIN-Hashes;
# backups/ und *.dump stehen in .gitignore und im Pre-Commit-Hook).
set -euo pipefail
cd "$(dirname "$0")/.."

ziel="backups"
while [ $# -gt 0 ]; do
  case "$1" in
    --ziel) ziel="${2:?--ziel braucht ein Verzeichnis}"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unbekanntes Argument: $1" >&2; exit 2 ;;
  esac
done

umgebung="$(node scripts/lib/pg-umgebung.mjs)" || exit 2
eval "$umgebung"
unset umgebung
mkdir -p "$ziel"
chmod 700 "$ziel"
stempel="$(date +%Y-%m-%d_%H%M%S)"
datei="$ziel/${PGDATABASE}_${stempel}.dump"
tmp="$datei.tmp"
umask 077
trap 'rm -f "$tmp"' EXIT

pg_dump -Fc --no-password -f "$tmp"
if [ ! -s "$tmp" ]; then echo "FEHLER: Dump ist leer" >&2; exit 1; fi
eintraege="$(pg_restore --list "$tmp" | grep -vc '^;')" || { echo "FEHLER: pg_restore kann den Dump nicht lesen" >&2; exit 1; }
mv "$tmp" "$datei"
trap - EXIT
groesse="$(du -h "$datei" | cut -f1)"
echo "OK: $datei ($groesse, $eintraege Einträge im Inhaltsverzeichnis, Datenbank $PGDATABASE)"
