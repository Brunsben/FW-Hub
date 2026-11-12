#!/usr/bin/env bash
# Dienstplan-Import auf dem Server (Produktion, einmalig; Phase 4).
#
# Aufruf (im Repo, z. B. ~/fw/FW-Hub):
#   scripts/server-import.sh --dry-run                 Probelauf, schreibt nichts
#   scripts/server-import.sh --als <kameradId>         Import
# Weitere Argumente gehen unverändert an scripts/dienstplan-import.mjs
# (z. B. --jahre 2026, --ersetzen). --testdaten wird abgelehnt.
#
# Eingaben: data/import/ im Repo (in .gitignore und .dockerignore) mit
#   "Dienstplan 2026.xlsx" und, nach der Klärung, zuordnung.json. Das Verzeichnis
#   wird read-only nach /app/data/import gemountet und nie ins Image kopiert.
# Ausgaben: Klärungsbericht und Vorlage nach data/import/bericht/ (beschreibbar
#   gemountet). Verzeichnisse mit Rechten 700, Dateien gehören dem Aufrufer.
#
# Was das Skript tut:
#   1. Baut das Image fwhub-import (Dockerfile-Stage "import", node_modules aus
#      package-lock.json über die deps-Stage).
#   2. Liest DATABASE_URL (fw_app) zur Laufzeit aus dem laufenden Portal-Container
#      (docker exec ... printenv). Der Wert wird nicht ausgegeben, nicht auf Platte
#      geschrieben und steht nicht in der Befehlszeile (nur als Umgebungsvariable).
#   3. Startet das Image im Netz fw-network. Der Import läuft damit als fw_app,
#      wie die App (RLS greift).
#
# Vorgaben per Umgebung überschreibbar (FWHUB_IMPORT_IMAGE, FWHUB_NETZ,
# FWHUB_APP_CONTAINER). Auf dem Server ist das nur nötig, wenn der
# Portal-Container anders heißt als fw_portal.
set -euo pipefail

IMAGE="${FWHUB_IMPORT_IMAGE:-fwhub-import}"
NETZ="${FWHUB_NETZ:-fw-network}"
APP_CONTAINER="${FWHUB_APP_CONTAINER:-fw_portal}"

cd "$(dirname "${BASH_SOURCE[0]}")/.."
EIN="$PWD/data/import"
AUS="$EIN/bericht"

for a in "$@"; do
  if [ "$a" = "--testdaten" ]; then
    echo "Abbruch: --testdaten ist auf dem Server nicht erlaubt." >&2
    exit 2
  fi
done
if [ ! -d "$EIN" ]; then
  echo "Abbruch: $EIN fehlt. Excel-Datei dorthin kopieren." >&2
  exit 2
fi
mkdir -p "$AUS"
chmod 700 "$EIN" "$AUS"

DATABASE_URL="$(docker exec "$APP_CONTAINER" printenv DATABASE_URL || true)"
if [ -z "$DATABASE_URL" ]; then
  echo "Abbruch: DATABASE_URL im Container $APP_CONTAINER nicht gefunden (FWHUB_APP_CONTAINER setzen?)." >&2
  exit 2
fi
export DATABASE_URL

echo "== Import-Image bauen ($IMAGE)"
docker build --target import -t "$IMAGE" .

echo "== Dienstplan-Import (Argumente: ${*:-keine})"
rc=0
docker run --rm --network "$NETZ" --user "$(id -u):$(id -g)" \
  -e DATABASE_URL \
  -v "$EIN:/app/data/import:ro" \
  -v "$AUS:/app/bericht" \
  "$IMAGE" --bericht /app/bericht "$@" || rc=$?

echo "== Bericht und Vorlage: $AUS"
case " $* " in
  *" --dry-run "*) ;;
  *)
    if [ "$rc" -eq 0 ]; then
      echo "Import abgeschlossen. Jetzt die Zuordnung und den Bericht löschen:"
      echo "  rm -f \"$EIN/zuordnung.json\" && rm -rf \"$AUS\""
    fi
    ;;
esac
exit "$rc"
