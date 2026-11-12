# Dienstplan – Ablauf am Deployment-Tag

Stand: 11.11.2026, Endstand Release 1 (Phasen 1–11 und CSV-Import für Kameraden,
Branch `feature/dienstplan`). Alle Befehle gegen den Server führt Ben aus.
Hintergrund und Prüf-SQL stehen in [PROGRESS.md](PROGRESS.md), Abschnitt
„Deployment-Checkliste“; diese Liste ist die Reihenfolge für den Tag selbst.

Zeiten sind Schätzungen für einen Durchgang ohne Überraschungen. Gesamt: etwa
1,5 Stunden Vorbereitung an den Tagen davor (plus deine lokale Durchklick-Liste),
4 bis 5 Stunden am Tag selbst (davon 1 bis 1,5 Stunden Import mit Klärung und
knapp 1 Stunde Exporttests), dazu später die Freischaltung.

Legende: **Du** = Ben, **Claude** = Arbeit im Repo, die vorher erledigt sein muss.

## Checkliste in Reihenfolge (Kurzfassung)

Zum Abhaken am Tag selbst. Einzelheiten in den genannten Schritten unten.

- [ ] **1. DB-Backup** (B1): `/root/fw/FW-Hub/scripts/server-backup.sh` als root →
  Exit 0, neue `.dump`-Datei in `/root/backups/fwhub/`, Kopie außerhalb des
  Servers. Stand notieren: `select count(*) from drizzle.__drizzle_migrations;` = **16**.
  (Lokal auf dem Mac entspricht das `scripts/db-backup.sh`; Restore-Probe mit
  `scripts/db-restore.sh <dump> fwhub_restore_test --aufraeumen`.)
- [ ] **2. B3**: Rollen-Skript nicht nötig; `\dp fw_food.*` im Owner-psql
  sichern und an Claude geben.
- [ ] **3. Migrationen 0016–0022** (B2): `git pull`, `scripts/server-migrate.sh`.
  Erwartet `Migrationen eingetragen: 16 -> 23`, `Policies in core` unverändert,
  `select count(*) from pg_policies where schemaname = 'dienstplan';` = **50**,
  Exit 0. Bei Abweichung **anhalten** (Rollback-Weg unten).
- [ ] **Vor dem Docker-Build: Next 16.4.6; `npm audit --omit=dev` ohne
  kritische/hohe Meldungen (bekannte Ausnahmen begründet).** Im Repo:
  `npm ls next` → `next@16.4.6`, dann `npm audit --omit=dev`. Erlaubt sind nur
  diese Ausnahmen (Stand 12.11.2026, keine kritische Meldung):
  - `nodemailer` 9.0.5 (hoch, Denial of Service im Adressparser u. a.): wird im
    Code nirgends importiert (kein E-Mail-Versand in Release 1). Behebbar nur mit
    Major-Update 10.x oder durch Entfernen der unbenutzten Abhängigkeit –
    Entscheidung bei Ben.
  - `source-map-js` 1.2.1 (hoch, DoS bei manipulierten Source-Maps): nur im Build
    über PostCSS/Tailwind, verarbeitet keine Eingaben von außen und läuft nicht
    im Request-Pfad.
  Jede andere hohe oder kritische Meldung: anhalten und an Claude geben.
- [ ] **4. Docker-Build** (A4, vorher auf Windows erprobt): auf dem Server in
  `~/fw/fwhub-stack` `docker compose build portal && docker compose up -d portal`
  (nie `-v`); `/api/health` ok, kein Fehler des Start-Schutzes im Log.
- [ ] **5. Smoke-Test PDF**: angemeldet `/api/dienstplan/plaene/2026/export/pdf`
  im Browser öffnen → PDF erscheint (HTTP 200, `application/pdf`). Kommt 500,
  im Log nach `Cannot find module …pdfkit…` sehen: Image ohne
  `outputFileTracingIncludes` aus `next.config.ts` gebaut → Stand prüfen, neu bauen.
  Dazu `…/export/bild?halbjahr=1` → Bild 1290 × 2796.
- [ ] **6. B10**: Exporte mit echten Zielen (DIVERA-Testtermin, Google-Testkalender,
  Abo-URL), Ergebnisse notieren.
- [ ] **7. Rollback-Weg bereit halten** (siehe „Rückweg“ unten):
  - App-Fehler nach Schritt 4: vorheriges Image starten
    (`docker compose up -d portal` mit dem alten Image-Tag bzw. nach
    `git checkout <vorheriger Stand>` neu bauen). 0016–0022 sind additiv, die alte
    App läuft mit ihnen weiter; die Migrationen bleiben.
  - Migration in Schritt 3 gescheitert: eine Transaktion, nichts angewendet;
    Ausgabe an Claude, alte App läuft weiter.
  - Daten kaputt (Import o. Ä.): App stoppen, Restore aus dem Backup von Schritt 1
    in eine neue Datenbank prüfen (Ablauf „Produktion: Backup“ in
    copilot-instructions.md), dann bewusst umschalten. Änderungen seit dem
    Backup gehen verloren.

## Was ausgerollt wird

| Migration | Inhalt | Reihenfolge |
|---|---|---|
| 0016 | Spitzname in core.kameraden | vor der App |
| 0017 | Claim dienst_rolle | **vor der App (Pflicht, sonst scheitert jeder Login)** |
| 0018 | Schema dienstplan (Tabellen, 39 Policies, Seeds) | vor der App |
| 0019 | Anzeige-Token, Fokus (6 Policies) | **vor der App (Pflicht)** |
| 0020 | vorjahr_themen() | **vor der App (Pflicht)** |
| 0021 | Mitglieder lesen Freigabe-Versionen (Policy ersetzt) | vor der App |
| 0022 | iCal-Abo, export_laeufe.format, DIVERA-Profile (5 Policies) | **vor der App (Pflicht)** |

Alle sind additiv: Die alte App läuft mit ihnen weiter. Erwartete Zählung:
`Migrationen eingetragen: 16 -> 23`, `Policies in core` vorher wie nachher
gleich, Policies in dienstplan **50**.

## A. Vorbereitung (Tage vorher)

| # | Schritt | Wer | Dauer |
|---|---|---|---|
| A1 | Lokale Prüfung auf dem Stand, der ausgerollt wird: Testliste aus PROGRESS „Vor dem Ausrollen“, inkl. Standalone-Test für PDF/Bild und `npm run test:e2e` (Klickliste im Browser). Mac: alle grün am 12.11.2026. | Claude | – |
| A2 | Deine lokale Durchklick-Liste (Bericht vom 11.11.2026, „Selbst durchklicken“). Auffälligkeiten an Claude; kleinere Fehler beheben wir nach dem Deployment. | Du | 60–90 min |
| A3 | `feature/dienstplan` nach `main` zusammenführen (Pull Request, CI `ci.yml` und `security.yml` grün). Der Server baut aus `~/fw/FW-Hub`. | Du | 15 min |
| A4 | Vorher prüfen: `npm ls next` = 16.4.6, `npm audit --omit=dev` ohne kritische/hohe Meldungen außer den begründeten Ausnahmen (Kurz-Checkliste). Dann Windows-Rechner: `git pull`, dann `docker build .` und `docker build --target import .`. Beide müssen durchlaufen (auf dem Mac gibt es kein Docker). Bei Fehlern: Ausgabe an Claude. | Du | 20–30 min |
| A5 | Excel `Dienstplan 2026.xlsx` auf den Server: `~/fw/FW-Hub/data/import/` anlegen (`mkdir -p`, `chmod 700`), Datei per `scp` hinein. Nie in ein anderes Verzeichnis des Repos. | Du | 10 min |
| A6 | Bereitlegen: Anwesenheitsliste als CSV aus der Kreis-Mitgliederverwaltung (Kameraden-Import), Liste Dienstplan-Admin/Planer, Ausgleichsliste (Gruppenführer), Ausbilder-Kürzel aus dem Excel, die als Spitzname gepflegt werden müssen. | Du | 15 min |
| A7 | Testziele für die Exporte: in Google einen leeren Kalender „Dienstplan Test“ anlegen (nicht den Mitglieder-Kalender); in DIVERA klären, wie ein Testtermin nur bei dir landet (Empfänger nur du bzw. eigene Testgruppe). | Du | 10 min |
| A8 | Wartungsfenster ankündigen (30 Minuten Ausfall reichen; Kiosk `/food` und PSA kurz nicht nutzen). | Du | 5 min |

## B. Am Deployment-Tag

### B1. Sichern und Stand erfassen (15 min, Du)
1. `/root/fw/FW-Hub/scripts/server-backup.sh` als root. Erwartet: Exit 0, neue
   `.dump`-Datei in `/root/backups/fwhub/`. Eine Kopie außerhalb des Servers ablegen.
2. Owner-psql (`docker exec -it fw_postgres psql -U nocodb -d fwhub`):
   `select count(*) from drizzle.__drizzle_migrations;` → **16** (0000–0015) und
   `select count(*) from pg_policies where schemaname = 'core';` notieren.

### B2. Code holen und migrieren (15 min, Du)
1. In `~/fw/FW-Hub`: `git pull` (Stand nach A3).
2. `scripts/server-migrate.sh`. Erwartet: `Migrationen eingetragen: 16 -> 23`,
   `Policies in core` vorher wie nachher gleich, Exit 0.
3. Prüf-SQL (Owner-psql):
   ```sql
   select count(*) from pg_policies where schemaname = 'dienstplan';                   -- 50
   select count(*) from pg_tables where schemaname = 'dienstplan' and not rowsecurity; -- 0
   select has_function_privilege('fw_app', 'dienstplan.vorjahr_themen(integer)', 'EXECUTE'), -- t
          has_function_privilege('fw_app', 'dienstplan.abo_scope(text)', 'EXECUTE');         -- t
   select has_column_privilege('fw_app', 'core.kameraden', 'spitzname', 'UPDATE'),     -- t
          has_column_privilege('fw_app', 'core.kameraden', 'dienst_rolle', 'UPDATE');  -- f
   select string_agg(kuerzel, ',' order by sortierung) from dienstplan.kategorien;      -- D,Z,G,O,J,K,B
   select name from dienstplan.export_profile order by name;  -- DIVERA 24/7, DIVERA 24/7 (Beginn/Ende)
   ```
   **Erst wenn das stimmt, weiter.**

### B3. Rollen-Skript (0–5 min, Du)
- `drizzle/manual/create-fw-app-role.sql` muss **nicht** laufen: Alle Rechte für
  dienstplan kommen aus den Migrationen. Nur falls es aus anderem Grund läuft:
  neue Fassung, Passwort-Platzhalter vorher ersetzen.
- Bei der Gelegenheit: `\dp fw_food.*` im Owner-psql und die Ausgabe an Claude
  (offene Frage zu den fw_food-Rechten im Rollen-Skript).

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

### B6. Kameraden vorbereiten (30–45 min, Du)
1. **Fehlende Kameraden per CSV**: `/mitglieder` → „CSV importieren“ → die
   Anwesenheitsliste (A6). Vorschau prüfen:
   - „neu“ und „ergänzen“ (leere Personalnummer wird nachgetragen) sind angehakt,
   - „prüfen“ (z. B. Organisationen wie „… AG (z.Hd. …)“, gleicher Name mit
     anderer Personalnummer) nur bei Bedarf anhaken,
   - „Konflikt“ (Personalnummer gehört jemand anderem) von Hand klären.
   „übernehmen“; die Meldung nennt angelegte und ergänzte Kameraden. Die
   CSV-Datei danach löschen (Personendaten).
2. **Spitznamen**: Für jedes Ausbilder-Kürzel aus dem Excel beim passenden
   Kameraden in `/mitglieder/[id]` → Stammdaten den Spitznamen eintragen (bei
   Bedarf Haken „Spitzname anzeigen“). Dann ordnet der Import diese Namen selbst zu.

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
   - **Exportprofile:** „DIVERA 24/7“ ansehen (Datum, Von, Bis, Titel, Text,
     Ort). Nichts ändern, bis B10 gezeigt hat, was DIVERA braucht.
2. `/dienstplan/planung` → „Neues Jahr anlegen“ → 2027. Beide Vorschauen
   vergleichen, „Zwischendienst um 2 Wochen versetzen“ wählen, anlegen.
3. Eingabemaske 2027 öffnen: Termine, Feiertagshinweise, Pflichtthemen-Hinweis
   erscheinen.

### B9. Präsentation am Fernseher prüfen (15 min, Du)
1. `docker exec fw_nginx nginx -T | grep -n "limit_req"`: nur die Zone und die
   Zeile im Block `/api/auth/` (sonst Block aus der Checkliste ergänzen).
2. Cloudflare: keine Rate-Limit- oder Cache-Regel auf `/api/*`; Bot Fight Mode
   bzw. Länder-Sperren dürfen `/api/dienstplan/abo/` nicht blocken (Google ruft
   aus den USA ab).
3. Eingabemaske 2027 → „Präsentation“ → „Anzeige-Link erzeugen“, QR-Code mit dem
   Fernseher bzw. einem Handy im Gäste-WLAN öffnen: Plan erscheint ohne
   Anmeldung. Termin anklicken → Rahmen folgt. „Alle Anzeige-Links beenden“.

### B10. Exporte mit echten Zielen testen (45–60 min, Du)
Ziel: klären, was DIVERA und Google bei erneutem Import tun (Spec 9.4, offene
Frage). Ergebnisse kurz notieren und an Claude geben.

**DIVERA mit einem Testtermin (CSV)**
1. Verwaltung → Exportprofile → „+ Profil“: Name „DIVERA Test“, dieselben
   Spalten wie „DIVERA 24/7“ (Datum = Beginn Datum, Von = Beginn Uhrzeit, Bis =
   Ende Uhrzeit, Titel = Titel mit Kategorie, Text = Beschreibung, Ort = Ort),
   Haken „Nur freigegebene Pläne“ **aus**, „Nur Kategorien“: `B`.
2. Eingabemaske 2027: einen Termin anlegen, Kategorie **B**, Datum in der
   nächsten Woche, 19:30, Thema als Freitext „Testtermin DIVERA“, dazu eine
   Person.
3. „Export“ → Profil „DIVERA Test“, Umfang „nur Änderungen“ → „CSV erzeugen“.
   Erwartet: Datei mit genau einer Zeile.
4. DIVERA: Termine → CSV-Kalender importieren → Datei wählen. Prüfen: Spalten
   werden automatisch erkannt (Datum, Von, Bis, Titel, Text, Ort), Umlaute
   stimmen, Text mehrzeilig, Empfänger nur du/Testgruppe. Importieren.
5. Im Portal die Uhrzeit des Testtermins auf 19:00 ändern, erneut „CSV erzeugen“
   (nur Änderungen). Erwartet: eine Zeile und die Liste „In DIVERA Test von Hand
   löschen“ mit dem 19:30-Termin. In DIVERA importieren und den alten Termin
   löschen. Notieren: Hat DIVERA den alten Termin selbst ersetzt oder doppelt
   angelegt?
6. Aufräumen: Testtermin in DIVERA und im Portal löschen. Das Profil „DIVERA
   Test“ lässt sich nach Exporten nicht löschen; in „DIVERA Test (alt)“
   umbenennen oder für weitere Tests behalten.
7. Falls etwas nicht erkannt wurde (z. B. Datumsformat, Empfänger): Profil
   „DIVERA 24/7“ in der Verwaltung anpassen (Format, fester Wert für
   „Empfänger“), ohne Codeänderung.

**Google-Kalender (.ics)**
1. „Export“ → Zeitraum „1. Halbjahr“, Kalender Umfang „komplett“ → „.ics
   erzeugen“.
2. Google Kalender (Browser) → Einstellungen → Importieren → Datei, Ziel
   „Dienstplan Test“. Prüfen: Termine mit Uhrzeit, Dauer, Thema, Beschreibung
   mit Verantwortlichen.
3. Im Portal einen Termin des 1. Halbjahres verschieben (z. B. Uhrzeit), erneut
   „.ics erzeugen“ (komplett) und wieder in „Dienstplan Test“ importieren.
   Notieren: Termin aktualisiert (gleiche UID) oder doppelt?
4. Änderung im Portal zurücknehmen. Testkalender danach löschen.

**Abo-URL (Google, optional DIVERA)**
1. Verwaltung → „iCal-Abo“ → „Abo-Adresse erzeugen“, Adresse kopieren (wird nur
   jetzt angezeigt).
2. Von außen prüfen (Handy ohne WLAN oder anderer Rechner):
   `curl -sI <Adresse>` → `200` und `content-type: text/calendar`.
3. Google Kalender → Weitere Kalender → „Per URL“ → Adresse. Die freigegebenen
   Pläne (2023–2026) erscheinen nach einigen Minuten bis Stunden. In der
   Verwaltung zählt „Abrufe“ hoch, sobald Google abruft.
4. Optional DIVERA: Termine → ICS-Kalender importieren → Adresse. Notieren:
   einmalig oder regelmäßig, Dubletten ja/nein.
5. Soll das Abo danach (noch) nicht genutzt werden: „Abo beenden“.

**Excel, PDF, Bild** (5 min): „Excel erzeugen“ öffnen (drei Blätter, Farben),
„PDF zum Ausdrucken“ (A4, Legende, Stand), auf dem Handy in `/dienstplan` →
„Bild fürs Handy“ (lange drücken → in Fotos sichern, als Sperrbildschirm
ansehen: Uhr und Widgets verdecken nichts). Ein PDF mit Fehler 500 heißt: Image
ohne den Stand von `next.config.ts` gebaut (siehe Rückweg).

### B11. Smoke-Test Dienstplan (20 min, Du)
Die Punkte aus der Checkliste „Smoke-Test nach dem Ausrollen“ in PROGRESS
(Spitzname, Rolle, Präsentation, Phase 7 Ziehen/Rückgängig auf einem Testplan,
Phase 8 Pool und Ausgleich, Mitgliederansicht mit einem Konto ohne Rolle), dazu:
- **Versionen** (Testplan): „Versionen“ → „Version speichern“, Termin ändern,
  „Mit aktuell“ zeigt die Änderung; als Admin „Wiederherstellen“ → Meldung mit
  Sicherung, Termin wieder wie vorher.
- **Geändert-Markierung**: in einem freigegebenen Plan einen Termin ändern →
  Mitglied sieht „geändert am …“ (danach zurücknehmen).
Testplan danach als Entwurf löschen.

### B12. Abschluss (10 min, Du)
- Uptime Kuma grün, Backups aus B1/B7 bis zum nächsten Tag aufbewahren.
- `data/import/` leer bzw. ohne `zuordnung.json` und `bericht/`; Anwesenheitsliste
  gelöscht.
- Kurze Rückmeldung an Claude: Ergebnis der Prüf-SQLs, `\dp fw_food.*`,
  Ergebnisse aus B10 (DIVERA/Google), Auffälligkeiten.

## C. Freischaltung (eigener Schritt nach der Abnahme)

Bis dahin ist das Modul nur über direkte Adressen erreichbar (`/dienstplan`,
`/dienstplan/planung`, Präsentation per Link). Für die Sitzung am 19.11. reicht
das: Planer arbeiten über die direkte Adresse, der Fernseher über den Anzeige-Link.

| # | Schritt | Wer | Dauer |
|---|---|---|---|
| C1 | Abnahme: Planung 2027 einmal komplett im Probelauf (Laptop + zweiter Bildschirm), danach Freigabe und Exporte nach DIVERA und Google auf dem in B10 ermittelten Weg. | Du | 1–2 h |
| C2 | Freischaltung im Code: `sichtbareModule()` (app-header.tsx), `MODUL_ICONS`, `ModulKey` (module-guard.ts), Profilzeile „Dienstplan“; Tests, Commit, Push. | Claude | 30–45 min |
| C3 | Zusammenführen und ausrollen wie A3, B2 (keine neue Migration erwartet) und B4. | Du | 30 min |
| C4 | Kopfzeile, Handy-Menü und Startseiten-Kachel zeigen „Dienstplan“; Konto ohne Rolle sieht nur die Mitgliederansicht. | Du | 10 min |

## Rückweg

- Migration schlägt fehl: eine Transaktion, nichts angewendet; Ausgabe an Claude.
- App-Probleme nach B4: vorheriges Image starten. 0016–0022 sind additiv; die alte
  App läuft mit ihnen weiter.
- Kameraden-Import falsch: Kameraden werden nie gelöscht. Falsch angelegte in
  `/mitglieder` deaktivieren bzw. korrigieren; ergänzte Personalnummern dort
  ändern. Der Änderungsverlauf zeigt, was der Import geschrieben hat.
- Plan-Import falsch: mit `--ersetzen` neu importieren (Pläne der Jahre werden
  ersetzt) oder Restore aus dem Backup von B7.
- PDF liefert 500 (Log `Cannot find module …pdfkit…`): Das Image wurde ohne die
  `outputFileTracingIncludes` aus `next.config.ts` gebaut; Stand prüfen, neu bauen.
