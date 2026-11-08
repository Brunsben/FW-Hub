#!/usr/bin/env bash
# Tägliches Backup der Datenbank fwhub (läuft auf dem Server per Cron, als root).
#
# Aufruf:
#   scripts/server-backup.sh                  Backup erstellen, prüfen, aufräumen
#   scripts/server-backup.sh --nur-aufraeumen nur die Aufbewahrung anwenden
#
# Was das Skript tut:
#   1. pg_dump -Fc der Datenbank fwhub aus dem Container fw_postgres
#      nach /root/backups/fwhub/fwhub_JJJJ-MM-TT_HHMM.dump (Rechte 600,
#      Verzeichnis 700). Es entsteht erst eine .tmp-Datei, die erst nach der
#      Prüfung umbenannt wird. Halbe oder kaputte Dumps tauchen nie als Backup auf.
#   2. Prüft: Datei größer als 0 Byte UND pg_restore --list kann sie lesen.
#      Sonst Exit 1 (und eine FEHLER-Zeile im Log).
#   3. Optional: Kopie nach $FWHUB_BACKUP_KOPIE (z. B. NAS-Mount). Leer = keine
#      Kopie. Schlägt die Kopie fehl, bleibt das lokale Backup erhalten, das
#      Skript endet trotzdem mit Exit 1.
#   4. Aufbewahrung (lokal und in der Kopie): alle Dumps der letzten 14 Tage,
#      dazu je der neueste Dump der letzten 8 Kalenderwochen davor. Der Rest wird
#      gelöscht. Angefasst werden nur Dateien nach dem Muster
#      fwhub_JJJJ-MM-TT_HHMM.dump, andere Dateien nie.
#   5. Schreibt eine Zeile pro Lauf nach /root/backups/fwhub/backup.log.
#
# Die Zugangsdaten braucht das Skript nicht: pg_dump läuft im Container über den
# lokalen Socket als POSTGRES_USER (wird zur Laufzeit gelesen, nichts davon wird
# gespeichert oder ausgegeben).
#
# Installation und Wiederherstellung: .github/copilot-instructions.md,
# "Produktion: Backup".
#
# Einstellungen per Umgebung (auf dem Server meist unnötig):
#   FWHUB_DB_CONTAINER  Standard fw_postgres
#   FWHUB_DB_NAME       Standard fwhub
#   FWHUB_BACKUP_DIR    Standard /root/backups/fwhub
#   FWHUB_BACKUP_KOPIE  Zielverzeichnis für eine Kopie, Standard leer (keine)
#   FWHUB_BACKUP_TAGE   Tage mit allen Dumps, Standard 14
#   FWHUB_BACKUP_WOCHEN Wochen mit je einem Dump danach, Standard 8
#   FWHUB_HEUTE         Bezugsdatum JJJJ-MM-TT (nur für Tests der Aufbewahrung)
set -Eeuo pipefail
umask 077
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

DB_CONTAINER="${FWHUB_DB_CONTAINER:-fw_postgres}"
DB_NAME="${FWHUB_DB_NAME:-fwhub}"
ZIEL="${FWHUB_BACKUP_DIR:-/root/backups/fwhub}"
KOPIE="${FWHUB_BACKUP_KOPIE:-}"
TAGE="${FWHUB_BACKUP_TAGE:-14}"
WOCHEN="${FWHUB_BACKUP_WOCHEN:-8}"
HEUTE="${FWHUB_HEUTE:-$(date +%F)}"
LOG="$ZIEL/backup.log"

NUR_AUFRAEUMEN=0
case "${1:-}" in
  "") ;;
  --nur-aufraeumen) NUR_AUFRAEUMEN=1 ;;
  *) echo "Aufruf: $0 [--nur-aufraeumen]" >&2; exit 2 ;;
esac

mkdir -p "$ZIEL"
chmod 700 "$ZIEL"

log() { printf '%s %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*" >> "$LOG"; }
fehler() { log "FEHLER $*"; echo "FEHLER: $*" >&2; exit 1; }
# shellcheck disable=SC2154  # rc wird im Trap-String selbst gesetzt
trap 'rc=$?; log "FEHLER Skript abgebrochen (Zeile $LINENO, Exit-Code $rc)"; exit "$rc"' ERR

# Nie zwei Läufe gleichzeitig (flock gibt es auf dem Server; fehlt es, wird übersprungen).
if command -v flock > /dev/null 2>&1; then
  exec 9> "$ZIEL/.lock"
  flock -n 9 || fehler "Ein anderer Lauf ist noch aktiv"
fi

# Aufbewahrung für ein Verzeichnis. Setzt GELOESCHT auf die Zahl gelöschter Dateien.
GELOESCHT=0
aufbewahren() {
  local dir="$1" heute_s grenze_s f name d s woche anzahl=0
  local -A neueste=() behalten=()
  local -a wochenschluessel=()
  heute_s="$(date -u -d "$HEUTE" +%s)"
  grenze_s=$(( heute_s - (TAGE - 1) * 86400 ))
  GELOESCHT=0

  # Das Glob sortiert alphabetisch, also nach Datum und Uhrzeit (alt nach neu).
  for f in "$dir"/fwhub_????-??-??_????.dump; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    [[ "$name" =~ ^fwhub_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}\.dump$ ]] || continue
    d="${name:6:10}"
    s="$(date -u -d "$d" +%s)"
    if [ "$s" -ge "$grenze_s" ]; then
      behalten["$f"]=1
    else
      woche="$(date -u -d "$d" +%G-%V)"
      neueste["$woche"]="$f"   # spätere (neuere) Dateien überschreiben frühere
    fi
  done

  # Die neuesten WOCHEN Wochen behalten.
  while IFS= read -r woche; do
    [ -n "$woche" ] || continue
    wochenschluessel+=("$woche")
  done < <(printf '%s\n' "${!neueste[@]}" | sort -r)
  for woche in "${wochenschluessel[@]:0:WOCHEN}"; do
    behalten["${neueste[$woche]}"]=1
  done

  for f in "$dir"/fwhub_????-??-??_????.dump; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    [[ "$name" =~ ^fwhub_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}\.dump$ ]] || continue
    if [ -z "${behalten[$f]:-}" ]; then
      rm -f -- "$f"
      anzahl=$(( anzahl + 1 ))
    fi
  done
  GELOESCHT="$anzahl"
}

if [ "$NUR_AUFRAEUMEN" -eq 1 ]; then
  aufbewahren "$ZIEL"
  log "OK nur Aufbewahrung, gelöscht: $GELOESCHT"
  exit 0
fi

# ── Backup erstellen ─────────────────────────────────────────────────────────
PGU="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)" \
  || fehler "POSTGRES_USER aus $DB_CONTAINER nicht lesbar (läuft der Container?)"

NAME="fwhub_$(date +%Y-%m-%d_%H%M).dump"
DATEI="$ZIEL/$NAME"
TMP="$ZIEL/.$NAME.tmp"
[ ! -e "$DATEI" ] || fehler "$NAME existiert bereits (zweiter Lauf in derselben Minute)"

if ! docker exec "$DB_CONTAINER" pg_dump -U "$PGU" -Fc "$DB_NAME" > "$TMP"; then
  rm -f -- "$TMP"
  fehler "pg_dump von $DB_NAME ist fehlgeschlagen"
fi

# ── Prüfen ───────────────────────────────────────────────────────────────────
if [ ! -s "$TMP" ]; then
  rm -f -- "$TMP"
  fehler "$NAME ist leer"
fi
if ! docker exec -i "$DB_CONTAINER" pg_restore --list < "$TMP" > /dev/null 2>&1; then
  rm -f -- "$TMP"
  fehler "$NAME ist für pg_restore nicht lesbar"
fi

chmod 600 "$TMP"
mv -- "$TMP" "$DATEI"
GROESSE="$(stat -c %s "$DATEI")"

# ── Optionale Kopie ──────────────────────────────────────────────────────────
KOPIE_STATUS="keine"
if [ -n "$KOPIE" ]; then
  KOPIE_STATUS="FEHLGESCHLAGEN"
  if [ -d "$KOPIE" ] && [ -w "$KOPIE" ] \
     && cp -- "$DATEI" "$KOPIE/.$NAME.tmp" \
     && [ "$(stat -c %s "$KOPIE/.$NAME.tmp")" = "$GROESSE" ] \
     && mv -- "$KOPIE/.$NAME.tmp" "$KOPIE/$NAME"; then
    KOPIE_STATUS="ok"
  else
    rm -f -- "$KOPIE/.$NAME.tmp" 2> /dev/null || true
  fi
fi

# ── Aufbewahrung ─────────────────────────────────────────────────────────────
aufbewahren "$ZIEL"
GELOESCHT_LOKAL="$GELOESCHT"
GELOESCHT_KOPIE="-"
if [ "$KOPIE_STATUS" = "ok" ]; then
  aufbewahren "$KOPIE"
  GELOESCHT_KOPIE="$GELOESCHT"
fi

if [ "$KOPIE_STATUS" = "FEHLGESCHLAGEN" ]; then
  log "WARNUNG $NAME $GROESSE Byte, gelöscht: $GELOESCHT_LOKAL, Kopie nach $KOPIE: FEHLGESCHLAGEN"
  echo "FEHLER: Die Kopie nach $KOPIE ist fehlgeschlagen (lokales Backup $NAME ist vorhanden)." >&2
  exit 1
fi
log "OK $NAME $GROESSE Byte, gelöscht: $GELOESCHT_LOKAL, Kopie: $KOPIE_STATUS (gelöscht: $GELOESCHT_KOPIE)"
