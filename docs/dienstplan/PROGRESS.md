# Dienstplan – Fortschritt (Release 1)

Übergabe zwischen den Rechnern. Nach jedem Arbeitsschritt aktualisieren.
Grundlage: [DIENSTPLAN_SPEC.md](DIENSTPLAN_SPEC.md) (Version 6, 11.11.2026), Abschnitt 11.
Zieltermin Sitzung: 19.11.2026, dafür zwingend Phasen 1–8.
Reihenfolge der Bearbeitung: 1, 2, 4 (Import), 3, 5, 6, 7, 8, danach 9–11.

## Stand

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Core-Migration (Spitzname, Anzeigename-Funktion mit Tests) | fertig (Migration 0016 lokal angewendet, nicht auf dem Server) |
| 2 | Schema `dienstplan`, Migration, RLS, Claim `dienst_rolle`, Seeds | offen |
| 3 | API inkl. Generator und Akzeptanztest 2026 | offen |
| 4 | Importskript Excel (Themenkatalog, Blockvorschläge, Verantwortliche, Pläne) | offen |
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
- `fw_food`-Rechte für fw_app stehen weder in den Migrationen noch in
  `drizzle/manual/create-fw-app-role.sql` (siehe Umgebung Mac). Auf dem
  Windows-Rechner und auf dem Server sind sie vermutlich von Hand vergeben.
  Soll das Skript sie aufnehmen? Nicht Teil des Dienstplans, nur gefunden.

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
- Kontrolle nach der Einrichtung: `test-haertung` 110 OK / 0 Fehler,
  `test-mitglieder` 181 OK / 0 Fehler (Stand Phase 1).
- Die DB enthält keine echten Mitglieder. Für den Import (Phase 4) braucht es
  Kameraden mit echten Namen, siehe dort.

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

Noch nicht begonnen. Konflikte Spec ↔ Repo am 11.11.2026 mit Ben geklärt:

### Entscheidungen
- Rollenwerte `Admin` / `Planer` / `Mitglied` (groß, wie die anderen Module),
  Bedeutung wie Spec Abschnitt 6.
- Ohne `dienst_rolle` gilt eine angemeldete Person als `Mitglied`: /dienstplan
  ist für alle sichtbar, die Rolle wird nur für Admin und Planer vergeben.
- Eigener Scope `withDienstplanScope` in `src/lib/db/scoped.ts` nach dem Muster
  von `withFunkScope` (setzt `app.kamerad_id` und `app.dienst_rolle`).
### Abweichungen von der Spec
- Es gibt keine globale Auth-Middleware (kein `middleware.ts`/`proxy.ts`).
  Jede Seite und Route prüft selbst (`getAuthUser`, Modul-Guards). Für
  Anzeige-Token und iCal-Abo ist deshalb keine Ausnahme einzutragen; die Routen
  prüfen das Token selbst. `withFoodPublicScope` darf laut Regel nicht
  wiederverwendet werden, es braucht einen eigenen, auf einen Plan begrenzten
  Token-Scope.
- Für das neue Schema `dienstplan` gibt es keine ALTER DEFAULT PRIVILEGES (nur
  core, psa, fw_funk). Die Migration muss USAGE und Tabellenrechte für fw_app
  selbst vergeben.

### Offene Fragen
- Keine (Rollenwerte, Standardrolle, Scope und Import-Testdaten geklärt, siehe
  Entscheidungen hier und in Phase 4).

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
### Abweichungen von der Spec
### Offene Fragen

## Phase 3 – API und Generator

### Entscheidungen
### Abweichungen von der Spec
### Offene Fragen

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
