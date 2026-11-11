# Dienstplan – Ablauf am Deployment-Tag

Stand: 11.11.2026, nach Phase 8 (Branch `feature/dienstplan`). Alle Befehle gegen
den Server führt Ben aus. Hintergrund und Prüf-SQL stehen in
[PROGRESS.md](PROGRESS.md), Abschnitt „Deployment-Checkliste“; diese Liste ist
die Reihenfolge für den Tag selbst.

Zeiten sind Schätzungen für einen Durchgang ohne Überraschungen. Gesamt: etwa
1 Stunde Vorbereitung an den Tagen davor, 3 bis 4 Stunden am Tag selbst (davon
1 bis 1,5 Stunden Import mit Klärung), dazu später die Freischaltung.

Legende: **Du** = Ben, **Claude** = Arbeit im Repo, die vorher erledigt sein muss.

## A. Vorbereitung (Tage vorher)

| # | Schritt | Wer | Dauer |
|---|---|---|---|
| A1 | Lokale Prüfung auf dem Stand, der ausgerollt wird: Testliste aus PROGRESS „Vor dem Ausrollen“ (Mac: zuletzt grün am 11.11.2026 nach Phase 8). | Claude | – |
| A2 | `feature/dienstplan` nach `main` zusammenführen (Pull Request, CI `ci.yml` und `security.yml` grün). Der Server baut aus dem Repo unter `~/fw/FW-Hub`. | Du | 15 min |
| A3 | Windows-Rechner: `git pull`, dann `docker build .` und `docker build --target import .`. Beide müssen durchlaufen (auf dem Mac gibt es kein Docker; die Stages sind sonst ungetestet). Bei Fehlern: Ausgabe an Claude. | Du | 20–30 min |
| A4 | Excel `Dienstplan 2026.xlsx` sicher auf den Server kopieren: `~/fw/FW-Hub/data/import/` anlegen (`mkdir -p` und `chmod 700`), Datei z. B. per `scp` hinein. Nie in ein anderes Verzeichnis des Repos. | Du | 10 min |
| A5 | Liste bereitlegen: wer bekommt Dienstplan-Admin, wer Planer (Gruppenführer), wer steht in der Ausgleichsliste. Ausbilder-Kürzel aus dem Excel (z. B. Spitznamen), die als Spitzname gepflegt werden müssen. | Du | 15 min |
| A6 | Wartungsfenster ankündigen (30 Minuten Ausfall reichen; Kiosk `/food` und PSA kurz nicht nutzen). | Du | 5 min |

## B. Am Deployment-Tag

### B1. Sichern und Stand erfassen (15 min, Du)
1. `/root/fw/FW-Hub/scripts/server-backup.sh` als root. Erwartet: Exit 0, neue
   `.dump`-Datei in `/root/backups/fwhub/`. Eine Kopie außerhalb des Servers ablegen.
2. Owner-psql (`docker exec -it fw_postgres psql -U nocodb -d fwhub`):
   `select count(*) from drizzle.__drizzle_migrations;` → **16** (0000–0015).

### B2. Code holen und migrieren (15 min, Du)
1. In `~/fw/FW-Hub`: `git pull` (Stand nach A2).
2. `scripts/server-migrate.sh`. Erwartet: `Migrationen eingetragen: 16 -> 21`,
   `Policies in core` vorher wie nachher gleich, Exit 0.
3. Prüf-SQL aus der Checkliste (Spaltenrechte, `pg_policies` in dienstplan = **45**,
   `vorjahr_themen` ausführbar, Kategorien `D,Z,G,O,J,K,B`).
   **Erst wenn das stimmt, weiter.** Die neue App braucht 0017, 0019 und 0020
   (sonst scheitern Login bzw. das Laden eines Plans).

### B3. Rollen-Skript (0–5 min, Du)
- `drizzle/manual/create-fw-app-role.sql` muss **nicht** laufen: Alle Rechte für
  dienstplan kommen aus den Migrationen. Nur falls es aus anderem Grund läuft:
  neue Fassung, Passwort-Platzhalter vorher ersetzen.
- Bei der Gelegenheit die offene Frage schließen: `\dp fw_food.*` im Owner-psql
  und die Ausgabe an Claude geben (fw_food-Rechte fürs Rollen-Skript).

### B4. App ausrollen (15 min, Du)
1. In `~/fw/fwhub-stack`: `docker compose build portal && docker compose up -d portal`
   (nie `-v`).
2. `/api/health` ok, im Log kein Fehler des Start-Schutzes.
3. Kurzer Smoke ohne Dienstplan: Login, `/mitglieder`, `/psa`, Kiosk `/food`.

### B5. Rollen vergeben (15 min, Du, als globaler Admin)
1. `/mitglieder/<deine Kamerad-ID>` → Rollen → Dienstplan **Admin** → Speichern,
   ab- und wieder anmelden. Die Kamerad-ID steht in der Adresse; du brauchst sie
   in B7 für `--als`.
2. Gruppenführer: jeweils Dienstplan **Planer**. Alle anderen brauchen keine
   Rolle (ohne Rolle = Mitglied).

### B6. Kameraden vorbereiten (30–60 min, Du)
1. Für jedes Ausbilder-Kürzel aus dem Excel beim passenden Kameraden in
   `/mitglieder/[id]` → Stammdaten den **Spitznamen** eintragen (bei Bedarf Haken
   „Spitzname anzeigen“). Dann ordnet der Import diese Namen selbst zu.
2. Fehlende Kameraden (im Excel als Ausbilder, aber nicht im Portal) in
   `/mitglieder` anlegen. Es gibt dafür derzeit keinen CSV-Import (siehe Bericht
   vom 11.11.2026; wird nur gebaut, wenn du das willst).

### B7. Import der Pläne 2023–2026 (60–90 min, Du)
1. Probelauf: in `~/fw/FW-Hub` `scripts/server-import.sh --dry-run`. Beim ersten
   Mal baut es das Image `fwhub-import` (5–10 min). Ergebnis in
   `data/import/bericht/`: `klaerung-<datum>.csv` und `zuordnung-vorlage-<datum>.json`.
2. Bericht durchgehen. Vorlage als `data/import/zuordnung.json` speichern und
   ausfüllen: offene Personen (Kamerad-ID, `"alle_gf"`, `"offen"`, `"ort"` oder
   extern), „Schwartenpohl“ (2025, Zeile 9) als `"ort"`, bestätigte
   Themen-Zusammenführungen. Bei Unklarheiten: Bericht ohne Namen beschreiben
   bzw. an Claude geben, **die Datei selbst nicht ins Repo**.
3. Probelauf wiederholen, bis „Import wäre so möglich“ erscheint.
4. Zweites Backup (`server-backup.sh`), dann Import:
   `scripts/server-import.sh --als <deine Kamerad-ID>`. Erwartet je Jahr
   `Plan JJJJ: N Termine, freigegeben`, Exit 0. Die Ausgleichsliste wird dabei
   nur als Vorschlag gefüllt (veraltetes Excel-Blatt).
5. Prüf-SQL: Pläne 2023–2026 freigegeben, keine `TEST-`-Kameraden.
6. **Aufräumen:** `rm -f data/import/zuordnung.json && rm -rf data/import/bericht`,
   Excel entfernen, wenn nicht mehr gebraucht, `docker image rm fwhub-import`.

### B8. Dienstplan einrichten (30 min, Du, als Dienstplan-Admin)
1. `/dienstplan/verwaltung`:
   - **Ausgleich (Gruppenführer):** echte Liste festlegen (Vorschlag aus dem
     Excel prüfen, Personen aufnehmen/entfernen).
   - **Pflichtthemen:** „Vorschlag übernehmen“, Ergebnis prüfen, abweichende
     Titel über „Bearbeiten“ markieren.
   - Kategorien und Rhythmusregeln ansehen; „Nächste 12“ der Regel Dienstabende
     muss zum echten Rhythmus passen.
2. `/dienstplan/planung` → „Neues Jahr anlegen“ → 2027. Beide Vorschauen
   vergleichen, „Zwischendienst um 2 Wochen versetzen“ wählen, anlegen.
3. Eingabemaske 2027 öffnen: Termine, Feiertagshinweise, Pflichtthemen-Hinweis
   erscheinen.

### B9. Präsentation am Fernseher prüfen (15 min, Du)
1. `docker exec fw_nginx nginx -T | grep -n "limit_req"`: nur die Zone und die
   Zeile im Block `/api/auth/` (sonst Block aus der Checkliste ergänzen).
2. Cloudflare: keine Rate-Limit- oder Cache-Regel auf `/api/*`.
3. In der Eingabemaske 2027 „Präsentation“ → „Anzeige-Link erzeugen“, QR-Code
   mit dem Fernseher bzw. einem Handy im Gäste-WLAN öffnen: Plan erscheint ohne
   Anmeldung. Termin anklicken → Rahmen folgt. „Alle Anzeige-Links beenden“.

### B10. Smoke-Test Dienstplan (20 min, Du)
Die Punkte aus der Checkliste „Smoke-Test nach dem Ausrollen“ (Spitzname, Rolle,
Präsentation, Phase 7 Ziehen/Rückgängig auf einem Testplan, Phase 8 Pool und
Ausgleich, Mitgliederansicht mit einem Konto ohne Rolle). Testplan danach als
Entwurf löschen.

### B11. Abschluss (10 min, Du)
- Uptime Kuma grün, Backups aus B1/B7 bis zum nächsten Tag aufbewahren.
- `data/import/` leer bzw. ohne `zuordnung.json` und `bericht/`.
- Kurze Rückmeldung an Claude: Ergebnis der Prüf-SQLs, `\dp fw_food.*`, Auffälligkeiten.

## C. Freischaltung (eigener Schritt nach der Abnahme)

Bis dahin ist das Modul nur über direkte Adressen erreichbar (`/dienstplan`,
`/dienstplan/planung`, Präsentation per Link). Für die Sitzung am 19.11. reicht
das: Planer arbeiten über die direkte Adresse, der Fernseher über den Anzeige-Link.

| # | Schritt | Wer | Dauer |
|---|---|---|---|
| C1 | Abnahme: Planung 2027 einmal komplett im Probelauf durchspielen (Laptop + zweiter Bildschirm). Exporte (DIVERA, iCal, PDF, Bild) kommen erst mit den Phasen 10/11. | Du | 1–2 h |
| C2 | Freischaltung im Code: `sichtbareModule()` (app-header.tsx), `MODUL_ICONS`, `ModulKey` (module-guard.ts), Profilzeile „Dienstplan“; Tests, Commit, Push. | Claude | 30–45 min |
| C3 | Zusammenführen und ausrollen wie A2, B2 (keine neue Migration erwartet) und B4. | Du | 30 min |
| C4 | Kopfzeile, Handy-Menü und Startseiten-Kachel zeigen „Dienstplan“; Konto ohne Rolle sieht nur die Mitgliederansicht. | Du | 10 min |

## Rückweg

- Migration schlägt fehl: eine Transaktion, nichts angewendet; Ausgabe an Claude.
- App-Probleme nach B4: vorheriges Image starten. 0016–0020 sind additiv; die alte
  App läuft mit ihnen weiter.
- Import falsch: mit `--ersetzen` neu importieren (Pläne der Jahre werden ersetzt)
  oder Restore aus dem Backup von B7.
