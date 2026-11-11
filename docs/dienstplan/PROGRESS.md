# Dienstplan – Fortschritt (Release 1)

Übergabe zwischen den Rechnern. Nach jedem Arbeitsschritt aktualisieren.
Grundlage: [DIENSTPLAN_SPEC.md](DIENSTPLAN_SPEC.md) (Version 6, 11.11.2026), Abschnitt 11.
Zieltermin Sitzung: 19.11.2026, dafür zwingend Phasen 1–8.
Reihenfolge der Bearbeitung: 1, 2, 4 (Import), 3, 5, 6, 7, 8, danach 9–11.

## Stand

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Core-Migration (Spitzname, Anzeigename-Funktion mit Tests) | fertig (Migration 0016 lokal angewendet, nicht auf dem Server) |
| 2 | Schema `dienstplan`, Migration, RLS, Claim `dienst_rolle`, Seeds | fertig (Migrationen 0017, 0018 lokal angewendet, nicht auf dem Server) |
| 3 | API inkl. Generator und Akzeptanztest 2026 | fertig (Verwaltung Kategorien/Regeln folgt mit Phase 5, Versionen mit Phase 9) |
| 4 | Importskript Excel (Themenkatalog, Blockvorschläge, Verantwortliche, Pläne) | fertig (lokal mit Testdaten importiert; echter Import wartet auf Klärung, siehe Phase 4) |
| 5 | Eingabemaske (Klickbedienung), Verwaltung, Feiertagshinweise | offen |
| 6 | Präsentationsansicht mit Live-Aktualisierung und Anzeige-Token | offen |
| 7 | Drag and Drop, Rückgängig, Vorjahresanzeige | offen |
| 8 | Themenpool, Pflichtthemen-Hinweis, Ausgleichsanzeige, Mitgliederansicht | offen |
| 9 | Versionen (Freigabe, manuell, Vergleich, Wiederherstellen) | offen |
| 10 | Exporte: CSV-Profile inkl. DIVERA, .ics, Excel | offen |
| 11 | PDF, Bild für Smartphone | offen |
| 12 | Erinnerungen (E-Mail) – Release 2 | offen |
| 13 | Katalog-Auswertung – Release 2 | offen |

## Allgemein

### Entscheidungen
- `data/import/` steht in `.gitignore` (Excel mit Personendaten, nie committen).
- Ordner `Docs/` in `docs/` umbenannt (der Auftrag nennt `docs/dienstplan/`; der
  Ordner war noch nicht im Repo).

### Abweichungen von der Spec
- (siehe je Phase)

### Offene Fragen
- **fw_food-Rechte (offen, wartet auf Ben):** Die Rechte von fw_app auf
  `fw_food` stehen weder in den Migrationen noch in
  `drizzle/manual/create-fw-app-role.sql`. Ben prüft auf dem Server mit
  `\dp fw_food.*`, was dort vergeben ist. Danach wird exakt dieser Stand ins
  Rollen-Skript übernommen. Bis dahin am Skript nichts ändern. Lokal (Mac) sind
  die Rechte von Hand vergeben (siehe Umgebung Mac, Schritt 5).

### Git
- Arbeit ausschließlich auf `feature/dienstplan` (ab 11.11.2026, nach Phase 1).
  `main` steht auf `origin/main`. Pushen macht Ben.
- `.github/workflows`: `ci.yml` (type-check, build) und `security.yml` (npm
  audit, Trivy, Gitleaks, Docker-Build zum Scannen) laufen bei Push und Pull
  Request auf `main`, `security.yml` zusätzlich montags. Kein Deployment. Ein
  Push auf `feature/dienstplan` startet nichts, erst ein Pull Request auf main.

### Umgebung (Rechner-spezifisch)
Windows-Rechner: wie in CLAUDE.md (Container fwhub-postgres-dev, PowerShell).

Mac (eingerichtet am 11.11.2026, Shell zsh, kein Docker):
- PostgreSQL 17 über Homebrew (`postgresql@17`, 17.11), gleiche Major-Version
  wie Produktion (`postgres:17-alpine` in docker-compose.yml). Läuft als
  Hintergrunddienst: `brew services start|stop postgresql@17`. Daten in
  `/opt/homebrew/var/postgresql@17`, nur auf localhost:5432.
- `pg_hba.conf`: TCP-Verbindungen (127.0.0.1, ::1) mit `scram-sha-256` statt
  `trust`, damit Passwörter wie in Produktion geprüft werden. Der Unix-Socket
  bleibt `trust` (Einrichtung mit `psql -U postgres -d fwhub_dev`). Original
  liegt daneben als `pg_hba.conf.orig`.
- Datenbank `fwhub_dev`, Rollen wie auf dem Windows-Rechner:
  - `postgres`: Owner, SUPERUSER, nur für Migrationen und Testaufbau
    (MIGRATE_DATABASE_URL)
  - `fw_app`: NOBYPASSRLS, kein Superuser (DATABASE_URL). Die App läuft nur so.
  - `fw_auth`: BYPASSRLS, kein Superuser (AUTH_DATABASE_URL)
- `.env.local` (Rechte 600, nicht im Repo) mit den drei URLs, JWT_SECRET und
  `DEV_ADMIN_PIN` für den lokalen Admin `devadmin` (Kamerad "Dev Admin"). Die
  Passwörter sind zufällig erzeugt und stehen nur dort.
- Reihenfolge der Einrichtung (für einen neuen Rechner ohne Docker):
  1. Rollen `postgres`, `fw_app`, `fw_auth` und DB `fwhub_dev` anlegen
     (die Migrationen 0007/0009/0014 erwarten fw_app und fw_auth)
  2. `node scripts/migrate.mjs` (als Owner)
  3. `drizzle/manual/create-fw-app-role.sql` als Owner, Platzhalter durch die
     Passwörter aus .env.local ersetzt
  4. `drizzle/manual/rls-policies.sql` und `rls-policies-food.sql` als Owner
     (die Food-Policies auf core.kameraden und fw_food liegen nur dort)
  5. fw_food-Rechte von Hand (fehlen im Repo, siehe Offene Fragen):
     `GRANT USAGE ON SCHEMA fw_food TO fw_app; GRANT SELECT, INSERT, UPDATE,
     DELETE ON ALL TABLES IN SCHEMA fw_food TO fw_app; GRANT USAGE, SELECT ON
     ALL SEQUENCES IN SCHEMA fw_food TO fw_app;`
  6. Einen aktiven globalen Admin anlegen (test-haertung 1f/1g setzt einen
     echten Admin außerhalb der Testkonten voraus)
  7. PSA-Stammdaten: `npx --yes tsx@4.19.2 --env-file=.env.local
     scripts/seed-psa-stammdaten.ts` (test-psa erwartet einen Ausrüstungstyp mit
     Prüfintervall)
- Kontrolle nach der Einrichtung (Stand Phase 2): siehe Phase 2, "Geprüft".
- test-setup und test-startschutz beendeten ihre Server nur mit `taskkill`
  (Windows). Seit Phase 2 über `scripts/lib/prozess.mjs`, auch auf dem Mac.
- Die DB enthält keine echten Mitglieder. Seit Phase 4 liegen dort Testdaten aus
  dem Import (`--testdaten`): 34 Kameraden mit `personalnummer` `TEST-DP-…` und
  die Pläne 2023–2026 (freigegeben). Neu aufbauen: `node
  scripts/dienstplan-import.mjs --testdaten --als <Dev-Admin-Kamerad> --ersetzen`
  (die lokale, ignorierte `data/import/zuordnung.json` enthält nur den
  Ort-Eintrag 2025, Zeile 9). Nach einer Regeländerung vorher entfernen, sonst
  bleiben alte Katalogthemen stehen.
  Entfernen (Owner-psql, nur lokal): Pläne, Themen, Blöcke, externe Personen und
  `ausgleich_personen` löschen, dann `core.mitglieder_audit` und `core.kameraden`
  der `TEST-DP-%`-Kameraden.

## Deployment-Checkliste

Was beim Ausrollen zu beachten ist. Befehle gegen den Server führt Ben aus.
Wird in jeder Phase ergänzt. Allgemeiner Ablauf siehe copilot-instructions.md
("Produktion: Server-Struktur und Migrationen", "Produktion: Backup").

Vor dem Ausrollen
1. Lokal grün: `npx tsc --noEmit`, `npm run build`, `node scripts/test-haertung.mjs`,
   `node scripts/test-dienstplan-rls.mjs`, `node scripts/test-anzeigename.mjs`,
   `node scripts/test-dienstplan-import-lib.mjs`, `node scripts/test-dienstplan-import.mjs`,
   `node scripts/test-dienstplan-kalender.mjs`, `node scripts/test-dienstplan-eingabe.mjs`,
   mit Dev-Server `node scripts/test-dienstplan-api.mjs`,
   `bash -n scripts/server-import.sh`,
   `node scripts/test-mitglieder-lib.mjs`, `node scripts/test-mitglieder-rechte.mjs`,
   mit Dev-Server `node scripts/test-dienstplan-auth.mjs`,
   `node scripts/test-mitglieder.mjs`, `node scripts/test-sitzungen.mjs`,
   `node scripts/test-setup.mjs` (eigener Server, 3100 vorher beenden)
2. Backup: `/root/fw/FW-Hub/scripts/server-backup.sh` als root, Kopie außerhalb
   des Servers
3. Stand erfassen (Owner-psql): `select count(*) from drizzle.__drizzle_migrations;`
   (vor dem Dienstplan: 16, also 0000–0015)

Migrationen, Reihenfolge
| Migration | Art | Reihenfolge | Hinweis |
|---|---|---|---|
| 0016_kameraden_spitzname | additiv | vor der App | Spalten, Spaltenrechte fw_app, Audit-Funktion ersetzt |
| 0017_kameraden_dienst_rolle | additiv | **vor der App (Pflicht)** | Spalte dienst_rolle, set_kamerad_rollen und Audit-Funktion ersetzt |
| 0018_dienstplan_schema | additiv | vor der App | Schema dienstplan (19 Tabellen, 39 Policies, Trigger, kameraden_namen()), Rechte fw_app, Seeds (Organisation 1, 7 Kategorien, 3 Regeln) |

**Reihenfolge: erst alle Migrationen, dann die App.** Die neue App liest
`core.kameraden.dienst_rolle` beim Login (ganze Zeile) und das Erst-Setup
übergibt `dienst_rolle` an set_kamerad_rollen. Läuft die neue App gegen eine
Datenbank ohne 0017, scheitert jede Anmeldung. Die alte App läuft mit allen
drei Migrationen unverändert weiter (nur neue Spalten, Funktionen nehmen eine
Obermenge an, neues Schema).

Alle ausstehenden Migrationen in einem Lauf: in `~/fw/FW-Hub` nach `git pull`
`scripts/server-migrate.sh`. Erwartet bei 0016–0018: `Migrationen eingetragen:
16 -> 19`, `Policies in core` unverändert (keine neuen Policies in core).

Manuelle Schritte auf dem Server
- Nach 0016: `drizzle/manual/create-fw-app-role.sql` nur noch in der neuen
  Fassung ausführen (alte Fassung entzieht die Spitzname-Rechte). Platzhalter
  vorher durch die echten Passwörter ersetzen, sonst werden die Passwörter von
  fw_app und fw_auth zurückgesetzt. Ein Lauf ist nach 0016 nicht nötig, nur
  falls das Skript aus anderen Gründen läuft.
- `create-fw-app-role.sql` fasst das Schema dienstplan nicht an; dessen
  Rechte kommen nur aus den Migrationen.
- Prüfen nach den Migrationen (Owner-psql):
  ```sql
  select has_column_privilege('fw_app','core.kameraden','spitzname','UPDATE'),          -- t
         has_column_privilege('fw_app','core.kameraden','spitzname_anzeigen','INSERT'), -- t
         has_column_privilege('fw_app','core.kameraden','karten_id','UPDATE'),          -- f
         has_column_privilege('fw_app','core.kameraden','dienst_rolle','UPDATE'),       -- f
         has_schema_privilege('fw_app','dienstplan','USAGE');                           -- t
  select count(*) from pg_policies where schemaname = 'dienstplan';                    -- 39
  select count(*) from pg_tables where schemaname = 'dienstplan' and not rowsecurity;  -- 0
  select string_agg(kuerzel, ',' order by sortierung) from dienstplan.kategorien;      -- D,Z,G,O,J,K,B
  ```

App ausrollen: in `~/fw/fwhub-stack` `docker compose build portal && docker
compose up -d portal` (nie `-v`).

Smoke-Test nach dem Ausrollen
- Globaler Admin: `/mitglieder/[id]` Spitzname setzen, Haken setzen,
  Anzeigename zeigt den Spitznamen, Änderungsverlauf zeigt beide Felder
- Globaler Admin: `/mitglieder/[id]` → Rollen zeigt "Dienstplan"; Rolle Planer
  setzen und wieder entfernen, Verlauf zeigt dienst_rolle
- Login als normaler Benutzer klappt (Claim dienst_rolle leer)

Import der Excel-Pläne 2023–2026 (Phase 4, nach Migrationen und App)
- Voraussetzung: 0018 ist angewendet, die App läuft (das Skript liest
  DATABASE_URL aus dem Portal-Container `fw_portal`; heißt er anders,
  `FWHUB_APP_CONTAINER=<name>` voranstellen). Die Kameraden stehen in der
  Produktionsdatenbank. Spitznamen (Kürzel in der Ausbilder-Spalte) vorher in
  `/mitglieder` pflegen, dann ordnet der Abgleich sie selbst zu.
- Die Zuordnungsdatei gilt nur für die Datenbank, gegen die sie erstellt wurde
  (Kamerad-IDs). Darum Probelauf und Klärung gegen die Produktion, nicht lokal.
- Excel, Bericht und `zuordnung.json` enthalten Personendaten. Sie liegen nur in
  `~/fw/FW-Hub/data/import/` (in `.gitignore` und `.dockerignore`, Rechte 700),
  werden read-only in den Container gemountet und nie ins Image kopiert.
- Ablauf (in `~/fw/FW-Hub` nach `git pull`):
  1. Excel nach `data/import/Dienstplan 2026.xlsx` kopieren.
  2. Probelauf: `scripts/server-import.sh --dry-run`. Baut das Image
     `fwhub-import` (Stage `import`) und liest nur (READ-ONLY-Transaktion).
     Ergebnis in `data/import/bericht/`: `klaerung-<datum>.csv` und
     `zuordnung-vorlage-<datum>.json`.
  3. Vorlage prüfen und als `data/import/zuordnung.json` speichern: offene
     Personen (Kamerad-ID, "alle_gf", "offen", "ort" oder extern), den
     Ort-Eintrag 2025, Zeile 9 als `"ort"`, bestätigte Themen-Zusammenführungen
     von `themen_vorschlaege` nach `themen`, weitere Blöcke nur bei Bedarf unter
     `bloecke` (AT / ELW-Gruppe / FwDv3 / Maschinisten ist eingebaut).
     Probelauf wiederholen, bis "Import wäre so möglich" erscheint.
  4. Backup (`/root/fw/FW-Hub/scripts/server-backup.sh`), dann Import:
     `scripts/server-import.sh --als <Kamerad-ID des Dienstplan-Admins>`.
     Erwartet: je Jahr `Plan JJJJ: N Termine, freigegeben`, Exit 0.
  5. Prüfen (Owner-psql):
     ```sql
     select jahr, status, (select count(*) from dienstplan.termine t where t.plan_id = p.id)
       from dienstplan.plaene p order by jahr;                          -- 2023–2026, freigegeben
     select count(*) from core.kameraden where personalnummer like 'TEST-%';  -- 0
     ```
  6. **Aufräumen:** `zuordnung.json` und den Bericht löschen (das Skript zeigt
     den Befehl): `rm -f data/import/zuordnung.json && rm -rf data/import/bericht`.
     Die Excel-Datei ebenfalls entfernen, wenn sie dort nicht mehr gebraucht
     wird. Das Image `fwhub-import` kann weg: `docker image rm fwhub-import`.
- `--testdaten` lehnt `server-import.sh` ab (Exit 2), und das Importskript bricht
  damit gegen jeden nicht-lokalen Host ab.
- Rückweg: Der Import ist eine Transaktion; bei einem Fehler wird nichts
  geschrieben. Nach erfolgreichem Import: mit `--ersetzen` neu importieren
  (löscht die Pläne der Jahre samt Terminen; Katalog, Blöcke und externe
  Personen bleiben und werden wiederverwendet) oder als Owner die Pläne löschen.

Sichtbarkeit (Spec 11: Nutzer sehen das Modul erst nach Release 1)
- Bis zur Freischaltung gibt es keinen Eintrag in Kopfzeile, Kacheln und
  Profil. Die Rolle ist nur im Rollen-Abschnitt (globaler Admin) sichtbar. Die
  API unter `/api/dienstplan` (seit Phase 3) ist für angemeldete Personen
  erreichbar, aber nirgends verlinkt. Schreiben dürfen nur Konten mit
  dienst_rolle Planer/Admin, und die vergibt nur der globale Admin. Ohne Pläne
  in der Produktion (vor dem Import) gibt es dort nichts zu sehen.
- Freischaltung (eigener Schritt nach der Abnahme): `sichtbareModule()` in
  app-header.tsx, `MODUL_ICONS`, `ModulKey` in module-guard.ts, Profilzeile
  "Dienstplan" (ohne Rolle: Mitglied).

Rückweg
- 0016–0018 sind additiv. Bei Problemen in der App: vorheriges Image starten,
  Spalten und Schema können bleiben (die alte App kennt sie nicht).
- Schema dienstplan vollständig entfernen (nur wenn nötig, Owner-psql):
  `DROP SCHEMA dienstplan CASCADE;` und die Einträge 0018 in
  drizzle.__drizzle_migrations löschen. Nicht für core-Migrationen.

---

## Phase 1 – Core-Migration (Spitzname, Anzeigename)

Umgesetzt (11.11.2026, Mac):
- Migration `drizzle/0016_kameraden_spitzname.sql`: Spalten `spitzname`,
  `spitzname_anzeigen` (Default false), Spaltenrechte INSERT/UPDATE für fw_app,
  `core.kameraden_audit` protokolliert beide Felder.
- `src/lib/mitglieder/anzeigename.ts`: `anzeigename`, `anzeigenameDetail`
  (mit Kennzeichen `mehrdeutig` für Regel 4), `anzeigenamen` (ganze Liste),
  `anzeigenameExtern`. Tests: `node scripts/test-anzeigename.mjs` (29 Prüfungen).
- Mitgliederverwaltung: Spitzname und Haken "Spitzname anzeigen" in den
  Stammdaten (nur globaler Admin schreibt, wie alle Stammdaten), Anzeige des
  berechneten Anzeigenamens und Hinweis bei identischen Namen, Validierung,
  API (POST/PATCH), Änderungsverlauf mit Feldnamen.
- `drizzle/manual/create-fw-app-role.sql`: Der Schlussblock vergibt die
  Spaltenrechte neu und hätte bei einem erneuten Lauf die Spitzname-Rechte
  entzogen. Jetzt mit Spitzname, sobald die Spalten existieren.
- Tests: `scripts/test-haertung.mjs` Abschnitt 7a (Spaltenrechte, Policies,
  Protokoll), `scripts/test-mitglieder.mjs` (API, Detailseite, Hinweis bei
  identischen Namen, Profil ohne Anzeigename), `test-mitglieder-lib.mjs`
  (Validierung).
- Doku: copilot-instructions.md (Spaltenrechte, Anzeigename, Testtabelle).

Geprüft (Mac, Postgres 17 lokal, Tests als fw_app):
- `node scripts/migrate.mjs --bis 0015`, Rollen-Skript, dann
  `node scripts/migrate.mjs` → `16 -> 17`. Rollen-Skript danach erneut
  ausgeführt: Spitzname-Rechte bleiben (`has_column_privilege` t), karten_id
  und DELETE weiter f.
- `node scripts/test-haertung.mjs` 110 OK / 0 Fehler
- `node scripts/test-mitglieder.mjs` (Dev-Server 3100) 181 OK / 0 Fehler
- `node scripts/test-anzeigename.mjs`, `test-mitglieder-lib.mjs`,
  `test-mitglieder-rechte.mjs` alle OK
- `npx tsc --noEmit`, `npm run build` ok; `npx eslint` 0 Fehler (7 alte
  Warnungen in nicht berührten Dateien)

Ausrollen 0016 (macht der Mensch): additiv, vor oder mit der App. Danach
`create-fw-app-role.sql` nur in der neuen Fassung ausführen.

### Entscheidungen
- Personen, die mit Spitzname angezeigt werden, zählen bei Regel 2 und 3 nicht
  als Namensvetter. Sonst bliebe bei Vater und Sohn der Hinweis auch nach
  Vergabe eines Spitznamens für einen der beiden bestehen.
- Vergleiche ohne Groß-/Kleinschreibung, Leerzeichen bereinigt.
- Ein Vornamen-Präfix endet immer auf einem Buchstaben ("Karl-H.", nicht
  "Karl-."). Ist kein kürzeres Präfix eindeutig (Jan neben Jannik), wird der
  ganze Vorname ohne Punkt verwendet ("Meyer, Jan" / "Meyer, Jann.").
- Inaktive Kameraden zählen nicht als Namensvetter. Eine inaktive Person selbst
  bekommt trotzdem einen Namen (für alte Pläne), verglichen mit den aktiven.
- Spitzname höchstens 30 Zeichen. Der Haken darf ohne Spitzname gesetzt sein,
  dann greift die normale Regel.
- Der Anzeigename erscheint in der Mitgliederverwaltung nur für Rollen, die alle
  Kameraden sehen (`kannMitgliederSehen`), nicht im Profil (dort wäre der
  Vergleich falsch, weil nur die eigene Zeile sichtbar ist).
- Andere Module (PSA, Küche, Funk) zeigen weiterhin "Vorname Name"; sie können
  die Funktion später übernehmen. Keine Änderung in Phase 1.

### Abweichungen von der Spec
- Ablage `src/lib/mitglieder/anzeigename.ts` statt `lib/core/anzeigename.ts`
  (die Spec nennt das nur als Beispiel; im Repo liegt die zentrale
  Mitglieder-Logik unter `src/lib/mitglieder/`).
- Signatur `anzeigename(kamerad, kontext)`: `kontext` ist die Vergleichsmenge
  (Liste der Kameraden). "Derselben Organisation" entfällt vorerst, weil es in
  core keine Organisationen gibt (siehe offene Punkte der Spec).
- Die Spec erwähnt Spaltenrechte und Änderungsprotokoll nicht. Beides war nötig,
  sonst könnte die App den Spitznamen nicht schreiben (Spaltenrechte seit 0013)
  bzw. Änderungen fehlten im Verlauf (0014).

### Offene Fragen
- Keine.

## Phase 2 – Schema `dienstplan`

Umgesetzt (11.11.2026, Mac, Branch feature/dienstplan):
- Migration `0017_kameraden_dienst_rolle`: Spalte `core.kameraden.dienst_rolle`,
  `core.set_kamerad_rollen` kennt `dienst_rolle`, Audit protokolliert sie. fw_app
  hat kein Schreibrecht auf die Spalte.
- Migration `0018_dienstplan_schema`: alle Tabellen aus Spec 4.3 plus
  `dienstplan.organisationen`; Rechte fw_app; Hilfsfunktionen `akt_org()`,
  `akt_kamerad()`, `ist_admin()`, `ist_planer()`, `ist_mitglied()`; ENABLE und
  FORCE RLS auf allen 19 Tabellen, 39 Policies; Trigger `plaene_schutz`
  (Status/Freigabe nur Admin) und Versionszählung (Termin, Thema,
  Verantwortlicher → `termine.aktualisiert_am` und `plaene.version`);
  `dienstplan.kameraden_namen()`; Seeds (Organisation 1, Kategorien D Z G O J K
  B, Regeln Dienstabende, Gruppenführerrunde, Ortskommando, Erinnerungs-
  Einstellungen).
- Drizzle-Schema `src/lib/db/schema-dienstplan.ts` (drizzle.config.ts liest
  beide Schemadateien).
- Claim `dienst_rolle`: JWT, Login, Erst-Setup (erster Admin bekommt Admin wie
  in allen Modulen), Rollen-Route und -Formular, Mitglieder-Projektion,
  Validierung (Rolle im Stammdaten-Body abgelehnt), Verlauf, Benutzerliste.
- `src/lib/dienstplan/auth.ts` (Rollen, `requireDienstplanSession`,
  Organisation 1), `withDienstplanScope` in `src/lib/db/scoped.ts`.
- Erste Route `GET /api/dienstplan/kategorien` (Durchstich Session → Scope →
  RLS, wird in Phase 3 Teil der API).
- Tests: `scripts/test-dienstplan-rls.mjs` (74 Prüfungen),
  `scripts/test-dienstplan-auth.mjs` (12 Prüfungen, findet alle Routen selbst);
  test-haertung, test-setup, test-mitglieder-lib um dienst_rolle ergänzt.
- `exceljs@4.4.0` als Abhängigkeit (Spec 9.1; für den Import in Phase 4).
- `scripts/lib/prozess.mjs`: test-setup und test-startschutz beenden ihre
  Server jetzt auch auf macOS/Linux (vorher nur `taskkill`).
- Doku: copilot-instructions.md (Claim, Schema, Scope, Default Privileges,
  Tests, Modulübersicht).

Geprüft (Mac, Postgres 17, Tests als fw_app):
- `node scripts/migrate.mjs` → `17 -> 19`
- `test-dienstplan-rls` 74/0, `test-haertung` 111/0, `test-dienstplan-auth`
  12/0, `test-mitglieder`, `test-sitzungen`, `test-ui-a`, `test-food`,
  `test-psa`, `test-login-deaktiviert`, `test-login-sperre`, `test-setup`,
  `test-startschutz`, `test-migr-bis`, `test-anzeigename`,
  `test-mitglieder-lib`, `test-mitglieder-rechte`, `test-client-ip`: alle OK
- Gegenproben: gelockerte Policy `plaene_lesen` → test-dienstplan-rls meldet 2
  Fehler; Route ohne Login-Prüfung → test-dienstplan-auth meldet 2 Fehler
  (beides danach zurückgenommen)
- `npx tsc --noEmit`, `npm run build` ok; `npx eslint` 0 Fehler (7 alte
  Warnungen in nicht berührten Dateien)

### Entscheidungen
- Rollenwerte `Admin` / `Planer` / `Mitglied` (groß, wie die anderen Module),
  Bedeutung wie Spec Abschnitt 6.
- Ohne `dienst_rolle` gilt eine angemeldete Person als `Mitglied`: /dienstplan
  ist für alle sichtbar, die Rolle wird nur für Admin und Planer vergeben. Ein
  unbekannter Wert gilt ebenfalls als Mitglied, nie als mehr.
- Eigener Scope `withDienstplanScope` in `src/lib/db/scoped.ts` nach dem Muster
  von `withFunkScope` (setzt `app.kamerad_id`, `app.dienst_rolle`,
  `app.dienst_org`).
- Rechte im Detail (RLS):
  - Mitglied: Kategorien, Kataloge (Themen, Bereiche, Blöcke) und externe
    Personen lesen; freigegebene Pläne samt Terminen lesen; Vorschläge nur für
    sich mit Status offen einreichen, eigene sehen.
  - Planer: alle Pläne lesen; Termine, Themen, Verantwortliche schreiben (auch
    nach Freigabe); Kataloge und externe Personen pflegen; Vorschläge
    bearbeiten und löschen; Versionen und Exportläufe anlegen (nur im eigenen
    Namen); Regeln, Ausgleichsliste und Exportprofile lesen.
  - Admin: zusätzlich Kategorien, Regeln, Ausgleichsliste, Exportprofile,
    Erinnerungseinstellungen; Pläne anlegen, freigeben, zurücksetzen, löschen.
  - Status, Freigabe-Felder, Jahr und Organisation eines Plans ändert nur der
    Admin (Trigger `plaene_schutz`). Planer dürfen den Plan sonst nur über die
    Versionszählung berühren.
  - Versionen und Exportläufe sind unveränderlich (kein UPDATE/DELETE für
    fw_app). Den Erinnerungsversand schreibt später der Job (Release 2).
- Namen: Das Modul liest core.kameraden nie direkt (E-Mail, Karten-ID,
  Personalnummer). `dienstplan.kameraden_namen()` (SECURITY DEFINER) gibt allen
  Dienstplan-Rollen nur id, Vorname, Name, Spitzname, Haken und aktiv zurück,
  auch inaktive (alte Pläne). Muster wie `set_karten_id`.
- E-Mail externer Personen: RLS kann Spalten nicht trennen. Mitglieder dürfen
  die Zeilen lesen (Namen im Plan), die App gibt die E-Mail nur an Planer aus
  (Projektion wie in der Mitgliederverwaltung).
- Versionszählung per Trigger statt in jeder Route: Jede Änderung, egal von
  welcher Route, erhöht `plaene.version` (Grundlage für die Live-Ansicht).
- Seeds in der Migration (idempotent), vor dem Einschalten von RLS, damit sie
  auch mit einem Owner ohne BYPASSRLS laufen. Uhrzeit 19:30 für D, Z, G, O, J
  laut Plänen 2023–2026; K und B ohne Standarduhrzeit. Dauern laut Annahme der
  Spec (D, Z, G, O, J 2 h; K 4 h), B (Osterfeuer) 4 h.
- Regel Dienstabende gültig ab 01.01.2026 (Zwischendienst seit 2026 eine Woche
  vor dem Dienstabend). Eine Regel für 2023–2025 gibt es nicht; die Altpläne
  kommen als Import (manuell), nicht aus dem Generator.
- Nutzer sehen das Modul bis Release 1 nicht (Spec 11): kein Eintrag in
  Kopfzeile, Kacheln, Profil. Siehe Deployment-Checkliste, "Sichtbarkeit".
- Farben der Kategorien als Token-Namen mit CHECK (blue, teal, …); Hex-Werte
  kommen erst mit der Oberfläche in globals.css.

### Abweichungen von der Spec
- Zusätzliche Tabelle `dienstplan.organisationen` (Seed id 1) als Ziel der
  Fremdschlüssel auf `organisation_id`. Die Spec nennt nur "eine Organisation
  als Seed"; ohne Tabelle gäbe es nichts zu seeden. Bei einer späteren
  `core.organisationen` werden nur diese Fremdschlüssel umgehängt.
- Untergeordnete Tabellen (termine, termin_themen, termin_verantwortliche,
  plan_versionen, export_laeufe, themenblock_positionen, erinnerungs_versand)
  tragen keine `organisation_id` (wie im Code der Spec, anders als ihr Satz
  "alle Tabellen"). RLS prüft die Organisation über den Elternsatz.
- Zeitstempel mit Zeitzone (`timestamptz`) wie im übrigen Schema, die Spec
  schreibt `timestamp`.
- Zusätzliche CHECKs und Indizes: Farbe als Token, Wochentag 1–7, Regeltyp
  passend zu den Feldern, Dauer > 0, Jahr 2000–2100, Anlass/Modus/Kodierung als
  Liste, eindeutiger Termin je (Plan, Regel, Rhythmusdatum) für den
  idempotenten Generator, Indizes für Termin- und Positionslisten.
- Spec 6: "über `withScope`" → eigener `withDienstplanScope` (entschieden).
- Spec 6: "Ausnahme bei einer globalen Auth-Middleware" → es gibt keine
  Middleware; jede Route prüft selbst, abgesichert durch
  `test-dienstplan-auth.mjs`.
- Die Spec nennt `dienst_rolle` nur als Claim. Damit er entsteht, braucht es
  die Spalte in core.kameraden, die Funktion set_kamerad_rollen, Rollen-Route,
  Formular und Audit (wie bei den anderen Modulrollen).
- Anzeige-Token (Phase 6) und iCal-Abo-Token (Phase 10) haben noch keine
  Tabellen; sie kommen mit ihren Phasen in eigenen Migrationen.

### Offene Fragen
- Keine für Phase 2.
- Hinweis: Kategorien und Themen werden per Fremdschlüssel referenziert, ohne
  Prüfung, dass sie zur selben Organisation gehören wie der Plan. Bei einer
  Organisation unkritisch; bei Mehrmandantenfähigkeit nachziehen.

## Phase 4 – Importskript

### Entscheidungen
- Vorgaben von Ben (11.11.2026):
  - Der reguläre Import legt NIE Kameraden an. Nicht zuordenbare Namen landen
    in einem Klärungsbericht (CSV und Konsole), die Zuordnung erfolgt manuell.
  - Zuerst ein Probelauf ohne Schreiben (`--dry-run`), der den Bericht erzeugt.
  - Ein Testdaten-Modus darf fehlende Kameraden anlegen, aber nur, wenn
    DATABASE_URL auf localhost zeigt. Sonst Abbruch mit Fehlermeldung, egal
    welches Flag gesetzt ist. So angelegte Kameraden sind erkennbar markiert
    (personalnummer mit Präfix `TEST-`).
  - Der Klärungsbericht liegt unter `data/import/` (`klaerung-<datum>.csv`),
    damit `.gitignore` ihn ausschließt. `.DS_Store` ist ebenfalls ignoriert.
- Entscheidungen von Ben nach dem ersten Bericht (11.11.2026):
  - **Themen:** Ein "/" im Thema bedeutet NICHT automatisch mehrere Themen. Nur
    Titel, die als Themenblock erkannt werden, werden positionsgleich aufgeteilt:
    fest eingebaut "AT / ELW-Gruppe / FwDv3 / Maschinisten" (`STANDARD_BLOECKE`)
    samt Schreibvarianten ("AT-Unterweisung") und anderer Reihenfolge. Alle
    anderen Titel sind ein Thema mit allen Ausbildern.
  - **Ort statt Person:** Der Eintrag in der Ausbilder-Spalte 2025, Zeile 9 ist
    ein Ort. Dafür gibt es den Zuordnungswert `"ort"`: Der Eintrag wird an
    `termine.ort` angehängt und nicht als Verantwortlicher übernommen. Er muss
    auch in der `zuordnung.json` der Produktion stehen.
  - **Server:** eigene Dockerfile-Stage `import` mit node_modules aus derselben
    Lockfile (deps-Stage). Excel und `zuordnung.json` werden nur zur Laufzeit
    read-only gemountet, nie ins Image kopiert (`data/` in `.dockerignore`).
    `zuordnung.json` liegt auf dem Server nur unter dem ignorierten Pfad
    `data/import/` und wird nach dem Import gelöscht.
  - **Zuordnung gegen Produktion:** Probelauf und Klärung laufen gegen die
    Produktionsdatenbank (die IDs sind dort andere als lokal).
- Aufbau: `scripts/dienstplan-import.mjs` (Excel lesen, Datenbank, Bericht
  schreiben), `scripts/lib/dienstplan-import.mjs` (reine Analyse, ohne
  Datenbank testbar), `scripts/server-import.sh` (Server, siehe
  Deployment-Checkliste). Aufruf und Optionen im Kopf des Skripts (`--hilfe`).
- Läuft als fw_app (DATABASE_URL) im Dienstplan-Scope mit Rolle Admin (GUCs wie
  `withDienstplanScope`), nicht als Owner: RLS greift auch beim Import. Kameraden
  liest es nur über `dienstplan.kameraden_namen()`. Alles in einer Transaktion,
  `--dry-run` als READ-ONLY-Transaktion (schreibt wirklich nichts).
- `--als <kameradId>` ist ohne `--dry-run` Pflicht (aktiver Kamerad):
  `freigegeben_von` der Pläne und `app.kamerad_id` für das Änderungsprotokoll.
- Manuelle Klärung über `data/import/zuordnung.json` (Vorlage schreibt jeder
  Lauf): `personen` (Kamerad-ID, "alle_gf", "offen", "ort" oder `{"extern":
  {"organisation", "name", "funktion"}}`), `themen` (Titel → Zieltitel, für ganze
  Titel und für Blockteile), `bloecke` (weitere Blöcke als Listen von Titeln).
  Vorschläge stehen getrennt in `themen_vorschlaege` und `bloecke_vorschlaege`
  und wirken erst, wenn sie übernommen werden.
- Was den Import blockiert: unbekannte oder mehrdeutige Personen, widersprüchliche
  oder ungültige Zuordnungen, unbekannte Typen, ungültige Daten, vorhandene Pläne
  ohne `--ersetzen`. Alles andere ist ein Hinweis im Bericht.
- Personen-Abgleich: Nachname, Nachname mit Initial bzw. Vornamen-Präfix
  ("Name, J.", "J. Name", "Name, Mar."), Vorname und Nachname, Spitzname
  (unabhängig von `spitzname_anzeigen`). Groß/klein egal, ß = ss. Inaktive
  Kameraden zählen mit (Altdaten). Schreibvarianten derselben Angabe
  ("B.Name"/"B. Name", "Name, I"/"I. Name") werden zu einer Person
  zusammengefasst; die Zuordnungsdatei darf jede Variante als Schlüssel nutzen.
- Organisationen ohne Person (Liste im Code: DRK, THW, Johanniter, ASB,
  Malteser, Polizei, Gemeinde, Landkreis, Rettungsdienst sowie "OF/FF/FW <Ort>")
  werden externe Personen ohne Namen. Gleiche Organisation wird wiederverwendet.
- Themen: Titel, die sich nur in Groß/klein und Leerzeichen unterscheiden, werden
  automatisch ein Katalogeintrag (häufigste Schreibweise). Alles Weitere nur über
  die Zuordnungsdatei; der Bericht schlägt vor (gleiche Wörter in beliebiger
  Reihenfolge, oder ein Titel enthält den anderen bei gleichem ersten Wort).
- Blockerkennung: Teile an "/" (nicht in Klammern, nicht vor "-"), gleiche
  Anzahl wie der Block, jeder Teil passt zu einem anderen Blockthema (gleich
  oder Schreibvariante: gleiches erstes Wort, enthält alle Wörter des
  Blockthemas). Die Teile werden zu den Blockthemen, die Reihenfolge des Titels
  bleibt. Ausbilder: Gruppen (an "/") positionsgleich; eine Gruppe gilt für jedes
  Thema; bei anderer Anzahl alle am ersten Thema mit Hinweis. Der Block wird als
  `themenbloecke` angelegt, die Termine verweisen mit `aus_block_id` darauf.
- Titel mit "/", die kein Block sind und mehrfach vorkommen, stehen als
  Blockvorschlag im Bericht ("bleibt ein Thema"). Aufgeteilt werden sie nur,
  wenn sie unter `bloecke` bestätigt werden.
- Katalogthemen nur bei D und Z. G, O, J, K, B bekommen Freitext-Themen
  (`titel_freitext`, Spec: "Sondertermine wie Weihnachtsfeier"). Entspricht der
  Titel nur dem Kategorienamen ("Zwischendienst", "Ortskommando") und gibt es
  keine Ausbilder, bekommt der Termin kein Thema.
- Termine: `quelle = 'manuell'` ohne Regelbezug, `dauer_minuten` leer
  (Standarddauer der Kategorie), Uhrzeit wie in Excel (leer bleibt leer).
  Positionen von Themen und Verantwortlichen beginnen bei 1.
- Pläne werden direkt als `freigegeben` angelegt, `freigegeben_am` = Zeitpunkt
  des Imports. Vorhandene Pläne: Abbruch, mit `--ersetzen` löschen und neu.
  Katalog, Blöcke und externe Personen werden wiederverwendet, nicht dupliziert.
- Blatt "Gruppenführer": Namen unter der Überschrift "GF" → `ausgleich_personen`
  (nur Kameraden). Blatt "Diensttypen" wird nicht gelesen (Kategorien kommen aus
  dem Seed in 0018, gleiche Kürzel).
- Testdaten-Modus: legt fehlende Personen als Kameraden an (Vorname = Initial
  oder "Test", Kürzel aus Großbuchstaben als Spitzname mit Anzeige) und ordnet
  mehrdeutige Namen dem ersten Kandidaten zu (im Bericht so vermerkt).

Geprüft (11.11.2026, Mac, nach Bens Entscheidungen)
- Probelauf gegen die Excel (Blätter 2023–2026), lokale `zuordnung.json` nur mit
  dem Ort-Eintrag: 220 Termine (4 ausgefallen), 53 Katalogthemen, 12 Vorschläge
  zum Zusammenführen, Block AT / ELW-Gruppe / FwDv3 / Maschinisten 17-mal
  erkannt, 3 Blockvorschläge (bleiben ein Thema), 61 Personen, 5 Hinweise (keiner
  mehr wegen ungleicher Ausbilder-Zahl).
- Testdaten-Import lokal neu aufgebaut: Pläne 2023–2026 freigegeben,
  216 Themen an Terminen, 316 Verantwortliche, 68 Blockthemen an 17 Terminen,
  34 Testkameraden, 17 Ausgleichspersonen. Der Ort-Eintrag steht in
  `termine.ort`, nicht unter den Verantwortlichen.
- `scripts/test-dienstplan-import-lib.mjs` (88 Prüfungen, ohne DB) und
  `scripts/test-dienstplan-import.mjs` (39 Prüfungen, DB ohne Server, Jahre
  2091/2092, erfundene Namen, räumt selbst auf). Gegenprobe (erste Fassung):
  ohne die Localhost-Sperre schlägt der Test fehl.
- Stage `import`: Docker gibt es auf dem Mac nicht, das Image ist nicht gebaut.
  Geprüft ist der Dateisatz der Stage (node_modules, die drei Skripte) in einem
  leeren Ordner mit read-only Eingabe und getrenntem Bericht-Ordner, sowie
  `scripts/server-import.sh` mit einem Docker-Ersatz (Aufrufe, Mounts, keine URL
  in der Ausgabe, `--testdaten` abgelehnt). Der erste echte Bau passiert auf dem
  Server.
- tsc, eslint (neue Dateien) sauber; test-dienstplan-rls, test-haertung,
  test-mitglieder(-lib, -rechte), test-anzeigename, test-client-ip,
  test-dienstplan-auth, test-sitzungen, test-food grün (erste Fassung, mit den
  Testdaten in der DB).

Verbleibende Hinweise im Bericht (blockieren nicht)
- 2025, Zeile 42: Typ fehlt, aus dem Titel abgeleitet: D
- 2023, Zeile 37: Datum 2022-08-29 liegt nicht im Planjahr, übernommen als 2023-08-29
- 2023, Zeilen 41, 45, 57: Dienstabend ohne Uhrzeit und Ausbilder (Feiertage),
  als ausgefallen übernommen

### Abweichungen von der Spec
- Spec 10.1: "Themenkatalog aus allen Themen (an „ / “ getrennt)". Nach Bens
  Entscheidung wird nur ein erkannter Themenblock getrennt, alle anderen Titel
  bleiben ein Thema.
- Ausgefallen: Spec nennt nur Typ F. Im Blatt 2023 stehen Feiertage als D ohne
  Uhrzeit und ohne Ausbilder; sie werden ebenfalls als ausgefallen übernommen
  (Grund = Titel in `bemerkung`, Hinweis im Bericht). Nur bei ausdrücklichem Typ
  D: Ein Termin ohne Typ (abgeleitet aus dem Titel) fällt nie automatisch aus.
- Fehlt der Typ, wird er aus dem Titel abgeleitet (Spec nennt das nur für das
  Blatt "2022"). Betrifft eine Zeile 2025, Hinweis im Bericht.
- Ein Datum mit falschem Jahr im Blatt (eine Zeile 2023) wird auf das Planjahr
  gesetzt, mit Hinweis.
- Ältere Blätter ("2022", "GF 2022", "2022 (Corona Spezial)") werden nicht
  importiert (Spec: "optional"). Nur Blätter "Dienstplan JJJJ".
- `freigegeben_am` ist der Importzeitpunkt (das Freigabedatum steht nicht in
  der Excel).
- Freitext-Themen der Kategorien G, O, J, K, B kommen nicht in den Katalog
  (siehe Entscheidungen).

### Offene Fragen
- **Klärung der Personen (Ben):** Probelauf gegen die Produktion, dann
  `zuordnung.json` füllen (inklusive Ort-Eintrag 2025, Zeile 9). Ablauf in der
  Deployment-Checkliste.
- **Themen-Zusammenführungen (Ben):** Die 12 Vorschläge im Bericht
  (`themen_vorschlaege` in der Vorlage) bestätigen oder verwerfen. Nichts davon
  wirkt ohne Übernahme nach `themen`.

## Phase 3 – API und Generator

### Entscheidungen
- Aufbau:
  - `src/lib/dienstplan/kalender.ts` (rein): Datumsrechnung auf ISO-Strings,
    gesetzliche Feiertage in Niedersachsen (lokal berechnet), Rhythmus-Treffer
    (`wochen_zyklus` mit mathematischem mod auch vor dem Anker,
    `monats_wochentag` mit n = 1–5 oder -1, Gültigkeit `gueltig_ab/_bis` je
    Datum, nur aktive Regeln).
  - `eingabe.ts` (rein): Eingabeprüfung; unbekannte Felder werden ignoriert,
    fehlende beim Ändern bleiben unverändert, null leert.
  - `hinweise.ts` (rein): Datentypen des geladenen Plans und Hinweise
    (Spec 7.6).
  - `plan.ts`: Plan laden (Termine, Themen, Verantwortliche mit Anzeigenamen,
    Feiertag je Termin, Hinweise), Generator, Positionen.
  - `route.ts`: gemeinsamer Rahmen `dienstplanRoute(mindestrolle, arbeit)`:
    401 ohne Session, 403 unter der Mindestrolle, eine Transaktion im
    Dienstplan-Scope, Fehler → Status (keine Zeile → 404, RLS/Rechte → 403,
    Unique → 409, Fremdschlüssel/Check → 400).
- Generator (Spec 5.3): legt je Treffer einen Termin mit `quelle = rhythmus`,
  `regel_id`, `rhythmus_datum` an, `ON CONFLICT` auf den Unique-Index (idempotent).
  Verschobene Termine behalten `rhythmus_datum` und werden nicht neu angelegt.
  Rhythmus-Termine löscht die API nicht (409), sie werden abgesagt
  (`ausgefallen`). Der Generator läuft nur für Entwürfe; ein Kürzel ohne aktive
  Kategorie wird übersprungen und gemeldet.
- Akzeptanztest 2026 (Spec 5.3) in `scripts/test-dienstplan-kalender.mjs` mit
  den Regeln aus der Datenbank (Seed 0018) gegen die Daten des bisherigen Plans
  (nur Daten, keine Namen, fest im Test): D = Dienstabende + JHV-Slots, Z und G
  exakt, O ab April; Januar erzeugt den 15.01. statt Fr 23.01. 2026 fällt kein
  Rhythmus-Termin auf einen Feiertag.
- Routen (alle unter `/api/dienstplan`, Mindestrolle in Klammern):
  - `GET plaene` (Mitglied, RLS: Mitglieder nur freigegebene), `POST plaene`
    `{jahr, generieren?}` (Admin; Generator standardmäßig an; 409 bei
    vorhandenem Jahr)
  - `GET plaene/[jahr]` (Mitglied) mit ETag `"v<version>-<status>"` und 304 bei
    If-None-Match; `PATCH plaene/[jahr]` `{status}` (Admin, Freigabe setzt
    `freigegeben_am/_von`, Zurücknehmen leert sie); `DELETE plaene/[jahr]`
    (Admin, nur Entwurf)
  - `POST plaene/[jahr]/generieren` (Planer, nur Entwurf)
  - `POST plaene/[jahr]/termine` (Planer, Datum im Planjahr, aktive Kategorie),
    `PATCH/DELETE termine/[id]` (Planer; DELETE nur manuelle Termine)
  - `POST termine/[id]/themen` `{themaId | titelFreitext | blockId}` (Planer,
    ans Ende; Block → alle Themen mit `aus_block_id`),
    `PATCH termin-themen/[id]` `{position?, terminId?}` (umsortieren, in anderen
    Termin desselben Plans verschieben samt Verantwortlichen),
    `DELETE termin-themen/[id]`; Positionen danach lückenlos 1..n
  - `POST termin-themen/[id]/verantwortliche` `{kameradId | externePersonId}`
    (Planer; nur aktive; doppelt → 409; Platzhalter nicht über die API),
    `DELETE termin-verantwortliche/[id]`
  - `GET/POST themen`, `PATCH themen/[id]` (Lesen Mitglied, Schreiben Planer;
    Titel ohne Groß/klein eindeutig; `zuletzt` = letztes durchgeführtes Datum
    bis heute; kein Löschen, stattdessen `aktiv`)
  - `GET/POST bloecke`, `PATCH/DELETE bloecke/[id]` (Löschen nur unbenutzt,
    sonst 409 → deaktivieren)
  - `GET/POST externe-personen`, `PATCH externe-personen/[id]` (E-Mail nur für
    Planer und Admin in der Antwort)
  - `GET personen` (Planer): aktive Kameraden mit Anzeigename und aktive
    externe Personen für die Auswahl
  - `GET kategorien` (Mitglied, aus Phase 2)
- Änderungen nach der Freigabe sind für Planer erlaubt (Spec 6, Einzeländerungen).
  Die Markierung "geändert" und die Version bei der Freigabe kommen mit Phase 9.
- Hinweise (nicht blockierend, in `GET plaene/[jahr]`): Dienstabend ohne Thema,
  Position eines Dienstabends ohne Verantwortliche, Feiertag, Kamerad am selben
  Tag in mehreren Terminen, aktives Pflichtthema fehlt im Plan. Ausgefallene
  Termine zählen nicht.

Geprüft (11.11.2026, Mac)
- `scripts/test-dienstplan-kalender.mjs` 26/0 (inkl. Akzeptanztest 2026),
  `scripts/test-dienstplan-eingabe.mjs` 41/0, `scripts/test-dienstplan-api.mjs`
  69/0 (Dev-Server; Admin/Planer/Mitglied-Konten, Jahr 2095, räumt selbst auf),
  `scripts/test-dienstplan-auth.mjs` 62/0 (findet die 17 neuen Routen selbst).
- Gegenproben: (1) Rollenprüfung im Routen-Rahmen abgeschaltet → Mitglieder
  können trotzdem nichts schreiben (Datenbank verweigert, 404 statt 403); der
  Test meldet 6 Fehler. (2) ETag konstant → Test meldet den Fehler. Beides
  zurückgenommen.
- tsc, eslint, `npm run build` sauber; test-dienstplan-rls, test-haertung,
  test-mitglieder, test-sitzungen, test-ui-a, test-food und die Import-Tests grün.

### Abweichungen von der Spec
- Feiertage ohne Bibliothek (`feiertagejs` war nur ein Beispiel): eigene
  Berechnung (Osterformel) in `kalender.ts`, getestet für 2026 und den
  Reformationstag ab 2018.
- Verwaltung von Kategorien und Rhythmusregeln (Spec 7.5) samt Vorschau und
  "Zwischendienst versetzen" (Spec 5.2a) kommen mit der Verwaltungsoberfläche in
  Phase 5. Die API dafür entsteht dort.
- Freigabe legt noch keine Version in `plan_versionen` an (Spec 8), das kommt mit
  Phase 9.
- Kopieren einer Themenposition (Drag and Drop mit Alt-Taste) kommt mit Phase 7.

### Offene Fragen
- `GET personen` ist nur in der Route auf Planer beschränkt: Mitglieder dürfen
  `kameraden_namen()` lesen (sie sehen die Namen im Plan, Entscheidung Phase 2),
  die Datenbank trennt hier nicht. Die Liste enthält nur Namensfelder. Bewusst
  so gelassen; bei Bedarf eigene Funktion nur für Planer.

## Phase 5 – Eingabemaske, Verwaltung, Feiertage

### Entscheidungen
### Abweichungen von der Spec
### Offene Fragen

## Phase 6 – Präsentationsansicht

### Entscheidungen
### Abweichungen von der Spec
### Offene Fragen

## Phase 7 – Drag and Drop, Rückgängig, Vorjahr

### Entscheidungen
### Abweichungen von der Spec
### Offene Fragen

## Phase 8 – Pool, Pflichtthemen, Ausgleich, Mitgliederansicht

### Entscheidungen
### Abweichungen von der Spec
### Offene Fragen

## Phasen 9–13

### Entscheidungen
### Abweichungen von der Spec
### Offene Fragen
