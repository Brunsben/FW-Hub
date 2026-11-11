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
| 5 | Eingabemaske (Klickbedienung), Verwaltung, Feiertagshinweise | fertig (Monatsraster folgt mit Phase 7) |
| 6 | Präsentationsansicht mit Live-Aktualisierung und Anzeige-Token | fertig (Migration 0019 lokal angewendet, nicht auf dem Server) |
| 7 | Drag and Drop, Rückgängig, Vorjahresanzeige | fertig (Migration 0020 lokal angewendet, nicht auf dem Server) |
| 8 | Themenpool, Pflichtthemen-Hinweis, Ausgleichsanzeige, Mitgliederansicht | fertig (keine Migration) |
| 9 | Versionen (Freigabe, manuell, Vergleich, Wiederherstellen) | fertig (Migration 0021 lokal angewendet, nicht auf dem Server) |
| 10 | Exporte: CSV-Profile inkl. DIVERA, .ics, Excel | fertig (Migration 0022 lokal angewendet, nicht auf dem Server) |
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
Die Reihenfolge für den Tag selbst mit Zeiten: [DEPLOYMENT_TAG.md](DEPLOYMENT_TAG.md).
Wird in jeder Phase ergänzt. Allgemeiner Ablauf siehe copilot-instructions.md
("Produktion: Server-Struktur und Migrationen", "Produktion: Backup").

Vor dem Ausrollen
1. Lokal grün: `npx tsc --noEmit`, `npm run build`, `node scripts/test-haertung.mjs`,
   `node scripts/test-dienstplan-rls.mjs`, `node scripts/test-anzeigename.mjs`,
   `node scripts/test-dienstplan-import-lib.mjs`, `node scripts/test-dienstplan-import.mjs`,
   `node scripts/test-dienstplan-kalender.mjs`, `node scripts/test-dienstplan-eingabe.mjs`,
   mit Dev-Server `node scripts/test-dienstplan-api.mjs`, `node scripts/test-dienstplan-verwaltung.mjs`,
   `node scripts/test-dienstplan-anzeige.mjs`, `node scripts/test-dienstplan-rueckgaengig.mjs`,
   `node scripts/test-dienstplan-pool.mjs`, `node scripts/test-dienstplan-versionen.mjs`,
   `node scripts/test-dienstplan-versionen-lib.mjs`, `node scripts/test-dienstplan-export-lib.mjs`,
   mit Dev-Server `node scripts/test-dienstplan-export.mjs`,
   `node scripts/kontrast.mjs`,
   `bash -n scripts/server-import.sh`,
   `node scripts/test-mitglieder-lib.mjs`, `node scripts/test-mitglieder-rechte.mjs`,
   `node scripts/test-mitglieder-import-lib.mjs`,
   mit Dev-Server `node scripts/test-dienstplan-auth.mjs`,
   `node scripts/test-mitglieder.mjs`, `node scripts/test-mitglieder-import.mjs`, `node scripts/test-sitzungen.mjs`,
   `node scripts/test-setup.mjs` (eigener Server, 3100 vorher beenden)
2. Docker-Build einmal auf dem Windows-Rechner (auf dem Mac gibt es kein
   Docker, die Stages sind dort nie gebaut worden): `docker build .` (Portal)
   und `docker build --target import .` (Import). Beide müssen durchlaufen,
   bevor auf dem Server gebaut wird.
3. Backup: `/root/fw/FW-Hub/scripts/server-backup.sh` als root, Kopie außerhalb
   des Servers
4. Stand erfassen (Owner-psql): `select count(*) from drizzle.__drizzle_migrations;`
   (vor dem Dienstplan: 16, also 0000–0015)

Migrationen, Reihenfolge
| Migration | Art | Reihenfolge | Hinweis |
|---|---|---|---|
| 0016_kameraden_spitzname | additiv | vor der App | Spalten, Spaltenrechte fw_app, Audit-Funktion ersetzt |
| 0017_kameraden_dienst_rolle | additiv | **vor der App (Pflicht)** | Spalte dienst_rolle, set_kamerad_rollen und Audit-Funktion ersetzt |
| 0018_dienstplan_schema | additiv | vor der App | Schema dienstplan (19 Tabellen, 39 Policies, Trigger, kameraden_namen()), Rechte fw_app, Seeds (Organisation 1, 7 Kategorien, 3 Regeln) |
| 0020_dienstplan_vorjahr | additiv | **vor der App (Pflicht)** | Funktion vorjahr_themen() (SECURITY DEFINER, nur Titel); die App ruft sie bei jedem Laden eines Plans |
| 0019_dienstplan_anzeige | additiv | **vor der App (Pflicht)** | Tabelle anzeige_tokens, Spalte plaene.fokus_termin_id, 6 Policies (Anzeige-Scope), Trigger anzeige_tokens_plan, kameraden_namen() ersetzt |
| 0022_dienstplan_exporte | additiv | **vor der App (Pflicht)** | Tabelle ical_abos (5 Policies), Funktion abo_scope(), export_laeufe.format und profil_id nullable, Seed-Profile „DIVERA 24/7“ und „DIVERA 24/7 (Beginn/Ende)“; Policies dienstplan 45 → 50 |
| 0021_dienstplan_versionen_lesen | additiv | vor der App | Policy plan_versionen_lesen ersetzt: Mitglieder lesen Freigabe-Versionen freigegebener Pläne (Markierung „geändert“); Anzahl Policies bleibt 45 |

**Reihenfolge: erst alle Migrationen, dann die App.** Die neue App liest
`core.kameraden.dienst_rolle` beim Login (ganze Zeile) und das Erst-Setup
übergibt `dienst_rolle` an set_kamerad_rollen. Läuft die neue App gegen eine
Datenbank ohne 0017, scheitert jede Anmeldung. Die alte App läuft mit allen
drei Migrationen unverändert weiter (nur neue Spalten, Funktionen nehmen eine
Obermenge an, neues Schema).

Alle ausstehenden Migrationen in einem Lauf: in `~/fw/FW-Hub` nach `git pull`
`scripts/server-migrate.sh`. Erwartet bei 0016–0022: `Migrationen eingetragen:
16 -> 23`, `Policies in core` unverändert (keine neuen Policies in core).
0019 und 0020 müssen vor der neuen App laufen: Die App liest
`plaene.fokus_termin_id` und ruft `dienstplan.vorjahr_themen()` bei jedem Laden
eines Plans.

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
  select count(*) from pg_policies where schemaname = 'dienstplan';                    -- 50 (39 aus 0018, 6 aus 0019, 5 aus 0022)
  select has_function_privilege('fw_app', 'dienstplan.abo_scope(text)', 'EXECUTE');    -- t
  select name from dienstplan.export_profile order by name;                            -- DIVERA 24/7, DIVERA 24/7 (Beginn/Ende)
  select has_function_privilege('fw_app', 'dienstplan.vorjahr_themen(integer)', 'EXECUTE');  -- t
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
- Präsentation (Phase 6), als Planer in `/dienstplan/<jahr>/bearbeiten`:
  „Präsentation“ → „Anzeige-Link erzeugen“. Link in einem privaten Fenster bzw.
  per QR-Code auf dem Handy öffnen: Plan erscheint ohne Anmeldung. Termin in der
  Eingabe anklicken: Rahmen springt in der Präsentation mit (2 s). „Alle
  Anzeige-Links beenden“: Präsentation zeigt den Hinweis auf einen neuen Link.
- Phase 7, als Planer in `/dienstplan/<jahr>/bearbeiten` (Testplan, nicht der
  echte): Thema aus der Seitenleiste auf einen Termin ziehen, Person auf das
  Thema ziehen, Thema mit gedrückter Alt-Taste in einen anderen Termin ziehen
  (Kopie), Strg+Z zweimal (beides zurück), Strg+Y. Monatsraster: Termin auf
  einen anderen Tag ziehen, Strg+Z. Vorjahreszeile erscheint, wenn der Vorjahres-
  plan freigegeben ist (Präsentation: `?vorjahr=1` oder Taste V).
- Phase 8: als Mitglied `/dienstplan` (aktuelles Jahr, „Nächster Termin“,
  Vorschlag einreichen); als Planer in der Eingabemaske Reiter „Pool“ (Vorschlag
  auf einen Termin ziehen) und „Ausgleich“ (Zahlen stimmen mit dem Plan).
  Testvorschlag danach im Pool verwerfen.
- Präsentation und Rate-Limits (geprüft am 11.11.2026 gegen die Repo-Dateien):
  Last: je Fernseher 30 Anfragen/Minute auf `/api/dienstplan/anzeige/<jahr>`
  (0,5 r/s, fast immer 304 ohne Inhalt), dazu die Eingabemaske vom selben
  Standort (gleiche öffentliche IP hinter dem Router) mit einigen Anfragen pro
  Aktion.
  - `nginx-ratelimit.conf` definiert nur die Zone `api` (30 r/s je IP).
    `nginx.conf` wendet sie ausschließlich in `location ^~ /api/auth/` an
    (`burst=10 nodelay`). `/api/dienstplan/*` läuft über `location /` ohne
    `limit_req`. **Das Polling fällt unter kein Limit; im Repo ist keine
    Änderung nötig.** Selbst unter der Zone `api` lägen zwei Fernseher plus
    Eingabe weit unter 30 r/s.
  - Die nginx-Konfiguration auf dem Server ist von Hand angepasst und nur mit
    dem Repo abgeglichen. Vor der Sitzung prüfen:
    `docker exec fw_nginx nginx -T | grep -n "limit_req"`. Erwartet: nur die
    Zone-Definition und die Zeile im Block `/api/auth/`. Taucht `limit_req` in
    `location /` oder einem `/api/`-Block auf, für die Anzeige einen eigenen
    Block vor `location /` ergänzen (Vorschlag, gleiche Proxy-Zeilen wie
    `location /`):
    ```nginx
    # nginx-ratelimit.conf
    limit_req_zone $binary_remote_addr zone=anzeige:1m rate=5r/s;
    # nginx.conf, im server-Block
    location ^~ /api/dienstplan/anzeige/ {
        limit_req zone=anzeige burst=20 nodelay;
        # … proxy_pass/proxy_set_header wie in location / …
    }
    ```
    5 r/s je IP reichen für 10 Fernseher am selben Standort; das Token
    schützt die Route, das Limit bremst nur Durchprobieren.
  - Cloudflare: Unter Security → WAF → Rate limiting rules prüfen, dass keine
    Regel `/api/*` oder den ganzen Host unter etwa 60 Anfragen/Minute je IP
    begrenzt. Falls doch, `/api/dienstplan/anzeige/` ausnehmen oder die Regel
    auf `/api/auth/` beschränken. Cache: Die Antworten tragen
    `Cache-Control: private, no-cache`; keine Cache-Rule darf `/api/*` cachen.

- Exporte und iCal-Abo (Phase 10): Ablauf mit DIVERA- und Google-Test steht in
  [DEPLOYMENT_TAG.md](DEPLOYMENT_TAG.md), Teil B. Netzwerkseite:
  - `/api/dienstplan/abo/<token>.ics` wird von Google (Server in den USA, Abruf
    alle paar Stunden) und ggf. von DIVERA ohne Anmeldung abgerufen. nginx: kein
    `limit_req` auf diesem Pfad (wie oben). Cloudflare: Bot Fight Mode bzw.
    „Super Bot Fight Mode“ und Länder-Sperren dürfen den Pfad nicht blocken
    (sonst bleibt der Kalender leer); Cache-Regeln nicht auf `/api/*`. Prüfen:
    `curl -sI https://portal.ofwietmarschen.org/api/dienstplan/abo/<token>.ics`
    von außerhalb → 200 und `content-type: text/calendar`.
  - Die Abo-URL enthält das Token im Pfad. Es landet damit in Zugriffslogs von
    Cloudflare und nginx (anders als beim Anzeige-Link, der das Fragment nutzt);
    Kalenderdienste können keine Header schicken. Ein Token gewährt nur Lesen
    freigegebener Pläne; bei Verdacht in der Verwaltung neu erzeugen.

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

Nach dem Import festlegen (Phase 8, als Dienstplan-Admin in der Oberfläche)
- **Ausgleichsliste auf dem Server festlegen.** Der Import trägt die Namen aus
  dem Excel-Blatt „Gruppenführer“ nur ein, wenn die Liste noch leer ist, und nur
  als Vorschlag; das Blatt ist veraltet. In `/dienstplan/verwaltung` →
  „Ausgleich (Gruppenführer)“ die echten Gruppenführer aufnehmen bzw. entfernen.
  Prüfen (Owner-psql): `select count(*) from dienstplan.ausgleich_personen;`
- **Pflichtthemen festlegen.** `/dienstplan/verwaltung` → Themenkatalog →
  „Vorschlag übernehmen“ markiert Sicherheitsunterweisung (bzw. vorhandene
  „Sicherheitsbelehrung“), Erste Hilfe und Atemschutzunterweisung (Zielgruppe
  Atemschutzgeräteträger). Abweichende Titel über „Bearbeiten“ → Haken
  „Pflichtthema“. Prüfen: `select titel, zielgruppe from dienstplan.themen where pflicht_jaehrlich;`

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
- **Personenauswahl nur für Planer (bewusste Entscheidung, Ben 11.11.2026):**
  `GET personen` ist nur in der Route auf Planer und Admin beschränkt. Die
  Datenbank trennt hier nicht, weil Mitglieder `kameraden_namen()` lesen dürfen
  (sie sehen die Namen im Plan, Phase 2). Die Liste enthält nur Namensfelder.
  So belassen, keine eigene Datenbankfunktion.
- Änderungen nach der Freigabe sind für Planer erlaubt (Spec 6, Einzeländerungen).
  Die Markierung "geändert" und die Version bei der Freigabe kommen mit Phase 9.
- Hinweise (nicht blockierend, in `GET plaene/[jahr]`): Dienstabend ohne Thema,
  Position eines Dienstabends ohne Verantwortliche, Feiertag, Kamerad am selben
  Tag in mehreren Terminen, aktives Pflichtthema fehlt im Plan. Ausgefallene
  Termine zählen nicht.

Geprüft (11.11.2026, Mac)
- `scripts/test-dienstplan-kalender.mjs` 47/0 (inkl. Akzeptanztest 2026 und
  Feiertagen 2024–2030: Karfreitag, Ostermontag, Himmelfahrt, Pfingstmontag
  als feste Sollwerte, Reformationstag 31.10. jedes Jahr, ab 2018),
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
- keine

## Phase 5 – Eingabemaske, Verwaltung, Feiertage

### Lokal starten (Mac, mit den importierten Plänen 2023–2026)
1. Postgres läuft (`brew services start postgresql@17`), die Testdaten aus Phase 4
   sind in `fwhub_dev` (Pläne 2023–2026, Testkameraden `TEST-DP-…`).
2. `npx next dev --webpack -p 3100`, dann http://localhost:3100/login, Anmeldung
   als `devadmin` (PIN in `.env.local`, `DEV_ADMIN_PIN`).
3. Einmalig die Dienstplan-Rolle geben: http://localhost:3100/mitglieder/11 →
   Rollen → Dienstplan „Admin“ → Speichern. Danach ab- und wieder anmelden (die
   Rollenänderung beendet die Sitzung, der neue Login trägt den Claim).
4. Planung: http://localhost:3100/dienstplan/planung (Liste, „Neues Jahr
   anlegen“), Eingabemaske z. B. http://localhost:3100/dienstplan/2026/bearbeiten,
   Verwaltung http://localhost:3100/dienstplan/verwaltung. Das Modul steht bis
   zur Freischaltung nicht in der Kopfzeile; die Adressen direkt aufrufen.
5. Dev-Server beenden: `Ctrl+C`, sonst `lsof -ti tcp:3100 | xargs kill`.

### Entscheidungen
- **Neues Jahr (Priorität Ben):** Dialog „Neues Jahr anlegen“ in
  `/dienstplan/planung` (nur Dienstplan-Admin). Zwei Karten nebeneinander: „Wie
  bisher“ und „Zwischendienst um 2 Wochen versetzen“, jeweils mit den ersten 8
  Wochen des neuen Jahres und den letzten 6 Dienstabend-/Zwischendienst-Terminen
  des Vorjahresplans (`GET /api/dienstplan/plaene/vorschau`). Anlegen schickt
  `POST /plaene {jahr, generieren, zwischendienstVersatz}`; Versatz und Generator
  laufen in einer Transaktion.
- **Versatz technisch (Spec 5.2a):** `versetzeMuster` verschiebt jedes Z im
  Muster um n Wochen (zyklisch); ist die Zielwoche belegt, ist der Versatz nicht
  möglich (409 bzw. Hinweis in der Vorschau). Die betroffene Regel endet am 31.12.
  des Vorjahres (`gueltig_bis`), eine Kopie mit versetztem Muster gilt ab 01.01.
  Beginnt die Regel schon am 01.01., wird nur ihr Muster geändert. Anker und
  D-Termine bleiben gleich. Für 2027 mit den Seeds: ohne Versatz Z am 26.01., mit
  Versatz am 12.01.
- **Verwaltungs-API:** `POST kategorien`, `PATCH kategorien/[id]` (Admin; Farbe nur
  als Token, Kürzel F gesperrt), `GET regeln` (Planer), `POST regeln`,
  `PATCH regeln/[id]` (Admin; Änderung wird mit dem gespeicherten Stand
  zusammengeführt und je Typ auf Vollständigkeit geprüft),
  `GET regeln/[id]/vorschau?anzahl=12` (nächste Treffer ab heute),
  `GET/POST bereiche`, `PATCH bereiche/[id]` (Planer). Regeln und Kategorien
  werden nicht gelöscht, sondern deaktiviert bzw. über gültig bis beendet.
- **Oberfläche** (alle unter `src/app/(portal)/dienstplan/`, Seitenschutz
  `requireDienstplanSeite`: ohne Login → /login, unter Planer → Startseite):
  - `/dienstplan/planung`: Pläne mit Status und Terminzahl, Links.
  - `/dienstplan/[jahr]/bearbeiten`: Eingabemaske. Termine nach Monaten als
    Karten (getönter Hintergrund 12 %, Akzentstreifen links, Kürzel immer
    sichtbar), Feiertag, „entfällt: Grund“, Ort. Klickbedienung: Termin
    anklicken → rechts Thema/Block „+“ oder Freitext; Thema anklicken → Personen
    „+“. Themen ↑/↓, in anderen Termin verschieben, entfernen; Verantwortliche ×.
    Termin bearbeiten/anlegen im Seitenpanel (Datum, Uhrzeit, Kategorie, Dauer,
    Ort, Bemerkung, Notizen, entfällt). Absagen/wieder aufnehmen, manuelle
    Termine löschen. Hinweise oben (Pflichtthemen immer sichtbar, übrige
    anklickbar → springt zum Termin). Seitenleiste: Themen mit Suche, „nur im
    Jahr noch nicht verplant“, „n× im Plan“, „zuletzt am“; neues Thema direkt
    anlegen; Blöcke; Personen mit Anzahl im Plan; externe Person anlegen.
    Kopf: „Rhythmus ergänzen“ (Entwurf), „+ Termin“, Freigeben/Zurück auf
    Entwurf (Admin).
  - `/dienstplan/verwaltung`: Kategorien, Rhythmusregeln (mit „Nächste 12“),
    Themenkatalog mit Bereichen, Blöcke (Reihenfolge per ↑/↓), externe
    Personen. Kategorien/Regeln für Planer nur lesend.
- **Kategoriefarben:** Tokens `--dp-<farbe>` hell/dunkel nach Spec 7.1 in
  `globals.css` (`:root`, `.dark`, `@theme inline` als `--color-dp-*`), Klassen
  über die feste Tabelle `components/dienstplan/farben.ts`. Text bleibt
  `foreground`/`muted-foreground`; `scripts/kontrast.mjs` prüft alle zehn Farben
  als 12-%-Tönung in beiden Themes (≥ 5,1:1).
- Feiertagshinweise: im Plan je Termin (`feiertag`) und als Hinweis; die Vorschau
  „Neues Jahr“ zeigt Feiertage ebenfalls.

Geprüft (11.11.2026, Mac)
- `scripts/test-dienstplan-verwaltung.mjs` 42/0 (Dev-Server): Vorschau = Generator
  mit/ohne Versatz, Plan mit Versatz (Regel aufgeteilt, Z versetzt, D gleich,
  Vorjahr unverändert), Kategorien/Regeln/Bereiche je Rolle, Seiten je Rolle.
  Stellt die Rhythmusregeln danach wieder her (geprüft).
- `test-dienstplan-kalender` 59/0 (Versatz), `test-dienstplan-eingabe` 57/0,
  `test-dienstplan-auth` 82/0 (neue Routen automatisch), `test-dienstplan-api` 69/0.
- Oberfläche im echten Chrome (puppeteer-core, nur im Scratchpad, nicht im
  Repo): Neues Jahr mit Versatz anlegen, Thema und Person per Klick, Termin
  über das Formular speichern, Verwaltung mit Regel-Vorschau, Mobil (390 px)
  ohne horizontales Scrollen, hell und dunkel angesehen. Keine Fehler in der
  Konsole außer `favicon.ico` 404 (App-weit, nicht Dienstplan).
- tsc, eslint (0 Fehler, 7 alte Warnungen), `npm run build`, `kontrast.mjs`
  grün; test-dienstplan-rls, test-haertung, test-mitglieder, test-sitzungen,
  test-ui-a, test-food, test-psa, Import-Tests grün.

### Abweichungen von der Spec
- Umschalter Liste/Monatsraster (Spec 7.2): nur die Liste. Das Monatsraster kommt
  mit Drag and Drop in Phase 7 (Terminkarte auf anderes Datum ziehen).
- Pool und Ausgleich in der Seitenleiste kommen mit Phase 8.
- Schrift Inter (Spec 7.1): nicht eingeführt; das Modul nutzt die bestehende
  FW-Hub-Schrift (Spec 7.1: "Nutzt das bestehende FW-Hub-Design"). Für PDF/Bild
  in Phase 11 neu bewerten.
- Planungsübersicht unter `/dienstplan/planung`, weil `/dienstplan` nach Spec
  7.4 die Mitgliederansicht wird (Phase 8).

### Offene Fragen
- keine

## Phase 6 – Präsentationsansicht

### Lokal testen: Eingabe und Präsentation gleichzeitig
1. Dev-Server und Anmeldung wie in Phase 5 („Lokal starten“), Konto mit
   Dienstplan-Rolle Planer oder Admin.
2. Fenster 1 (Laptop): http://localhost:3100/dienstplan/2026/bearbeiten.
3. Fenster 2 (Fernseher), eine von zwei Varianten:
   - **mit Anmeldung:** in der Eingabemaske „Präsentation“ → „In neuem Fenster
     öffnen“ (http://localhost:3100/dienstplan/2026/praesentation). Gleiche
     Sitzung, zeigt auch Notizen nicht an.
   - **wie der Fernseher, ohne Anmeldung:** „Präsentation“ → „Anzeige-Link
     erzeugen“, Link kopieren und in einem **privaten Fenster** (Chrome
     `Cmd+Shift+N`, Safari `Cmd+Shift+N`) öffnen. Der QR-Code funktioniert lokal
     nur auf demselben Rechner (`localhost`).
4. Fenster 2 mit `Ctrl+Cmd+F` auf Vollbild. Tasten in Fenster 2: `1` / `2`
   Halbjahr, `J` Gesamtjahr (oder `?ansicht=h1|h2|jahr` in der Adresse).
5. In Fenster 1 einen Termin anklicken (Schalter „Fokus“ an): Rahmen in der
   Präsentation folgt nach höchstens 2 Sekunden. Thema, Person oder Ort ändern:
   die Karte leuchtet in der Präsentation 3 Sekunden auf.

### Entscheidungen
- **Anzeige-Token (Migration 0019):** Tabelle `dienstplan.anzeige_tokens` mit
  SHA-256-Hash, Plan, Organisation, `gueltig_bis` (12 Stunden), Ersteller. Das
  Token (32 Zufallsbytes, base64url) steht nur einmal in der Antwort von
  `POST /api/dienstplan/plaene/[jahr]/anzeige`. Planer und Admin erzeugen,
  listen (`GET`, ohne Token) und beenden alle Links eines Plans (`DELETE`).
  Ein neuer Link löscht die abgelaufenen der Organisation. Die Policy erlaubt
  höchstens 24 Stunden Gültigkeit, auch falls die App sich verrechnet.
- **Token im URL-Fragment:** Link `…/dienstplan/<jahr>/praesentation#t=<token>`.
  Das Fragment schickt der Browser nie an den Server; die Seite liest es und
  sendet es als Header `X-Dienstplan-Anzeige` an
  `GET /api/dienstplan/anzeige/[jahr]`. So steht das Token in keinem
  Zugriffsprotokoll (nginx, Cloudflare) und in keinem Referer. Die Seite setzt
  zusätzlich `referrer: no-referrer` und `noindex`.
- **Anzeige-Scope in der Datenbank:** `withDienstplanAnzeigeScope(hash)` setzt
  nur `app.dienst_rolle='Anzeige'` und `app.dienst_anzeige=<hash>`. Die Policies
  zeigen dann genau den Plan der gültigen Token-Zeile (Termine, Themen,
  Verantwortliche folgen über ihre Lese-Policies), dazu Kategorien, Themen und
  externe Personen derselben Organisation. Plan-ID und Organisation kommen nie
  aus dem Request. Schreiben ist in diesem Scope unmöglich (keine Policy).
  `kameraden_namen()` prüft das Token im Rumpf selbst, weil die Funktion mit
  Eigentümerrechten läuft. Die Plan-Zugehörigkeit beim Anlegen prüft ein
  Trigger (`anzeige_tokens_plan`): Eine Unterabfrage auf `plaene` in der Policy
  wäre zirkulär (42P17), weil `plaene_anzeige` ihrerseits `anzeige_tokens` liest.
- **Statuscodes der Token-Route:** ohne, mit falschem oder abgelaufenem Token
  401; gültiges Token für einen anderen Plan 403. Das Token öffnet nur diese
  eine Route, nicht `/api/dienstplan/plaene/*` und keine Schreibroute.
- **Ohne Notizen:** Die Token-Route setzt `notizen` auf null (Lesen lässt sich in
  der Datenbank nicht pro Spalte trennen, Projektion wie in der
  Mitgliederverwaltung). Bemerkung bleibt (z. B. „entfällt: Heiligabend“).
  E-Mail-Adressen externer Personen lädt `ladePlan` gar nicht.
- **Zwei Zugänge, eine Seite:** `/dienstplan/[jahr]/praesentation` liegt
  außerhalb des Portalrahmens (wie der Kiosk), enthält selbst keine Daten und
  holt sie mit Token über die Token-Route oder ohne Token mit der eigenen
  Anmeldung über `GET /api/dienstplan/plaene/[jahr]`. So geht der zweite
  Bildschirm am Laptop ohne Link, der Fernseher mit Link.
- **Polling (Spec 7.3):** alle 2 Sekunden mit `If-None-Match`; der nächste
  Abruf startet erst nach dem vorherigen. ETag `"v<version>-<status>-f<fokus>"`:
  Der Fokus ändert den ETag, aber nicht `plaene.version` (Version zählt nur
  Inhaltsänderungen; wichtig für Phase 9). Bei Netzfehlern bleibt der letzte
  Stand stehen, die Kopfzeile zeigt „Verbindung unterbrochen“. Bei 401/403
  hört das Polling auf und die Seite zeigt den Hinweis, einen neuen Link zu
  erzeugen.
- **Fokus:** Spalte `plaene.fokus_termin_id` (FK auf termine, `ON DELETE SET
  NULL`), gesetzt über `PUT /api/dienstplan/plaene/[jahr]/fokus` (Planer, Termin
  muss zum Plan gehören). Schalter „Fokus“ in der Eingabemaske, Standard an:
  Jeder angeklickte Termin wird Fokus; Ausschalten setzt den Fokus auf null.
  Liegt ein neuer Fokus im anderen Halbjahr, wechselt die Präsentation dorthin
  (Gesamtjahr bleibt Gesamtjahr).
- **Hervorhebung:** Vergleich von `aktualisiert_am` je Termin (Trigger setzt es
  bei jeder Änderung an Termin, Thema oder Verantwortlichem). Geänderte und neue
  Karten bekommen 3 Sekunden einen Rahmen in `warning`, der Fokus dauerhaft
  einen Rahmen in `primary`.
- **Darstellung:** Halbjahr als Standard (im laufenden Jahr das aktuelle, sonst
  das 1. Halbjahr), 6 Monatsspalten; Gesamtjahr mit 12. Alle Maße in `em`,
  Schriftgröße in `vw`: Sie startet groß (Halbjahr 1,4 vw ≈ 27 px bei 1920,
  54 px bei 3840) und wird automatisch kleiner, bis keine Spalte mehr in Höhe
  oder Breite überläuft. Lange Themen werden getrennt (`hyphens`), Datum und
  Uhrzeit nie. Kopfzeile mit Plan, Status, „Dienstabende ohne Thema: n“,
  Pflichtthemen-Hinweis und Stand der letzten Abfrage.
- Getestet (Chrome, zwei Fenster, Plan 2026): 1920×1080 ohne Scrollen und
  Überlauf, 4K mit doppelter Schrift, Fokus nach ca. 1,3 s, Hervorhebung nach
  ca. 1,7 s und nach 3 s wieder weg, Beenden des Links sperrt die Anzeige.

### Abweichungen von der Spec
- Spec 6 nennt eine globale Auth-Middleware, bei der die Route als Ausnahme
  einzutragen wäre. Die gibt es nicht; jede Route prüft selbst. Die Token-Route
  steht stattdessen in `TOKEN_ROUTEN` von test-dienstplan-auth.mjs.
- Vorjahresanzeige in der Präsentation (Spec 7.2, „Standard: aus“) kommt mit
  der Vorjahresanzeige in Phase 7.
- Umschalten Halbjahr/Gesamtjahr ohne sichtbare Bedienelemente: Parameter
  `?ansicht=` oder Tasten 1, 2, J.

### Offene Fragen
- Keine.

## Phase 7 – Drag and Drop, Rückgängig, Vorjahr

### Lokal ausprobieren
Wie Phase 6 (Eingabe und Präsentation in zwei Fenstern), z. B. mit
http://localhost:3100/dienstplan/2026/bearbeiten (Vorjahr 2025 ist importiert und
freigegeben). Präsentation mit Vorjahr: `…/praesentation?vorjahr=1` oder Taste V.
Achtung: Änderungen am Plan 2026 bleiben in der lokalen Datenbank; mit
Rückgängig zurücknehmen.

### Entscheidungen
- **Drag and Drop mit dnd-kit** (`@dnd-kit/core` 6.3.1, ohne weitere Pakete).
  Gezogen wird mit Maus oder Finger ab 6 px Bewegung; darunter bleibt es ein
  Klick, die Knöpfe in den Zeilen funktionieren weiter. Alle Wege der Spec-Tabelle:
  | Quelle | Ziel | Wirkung |
  |---|---|---|
  | Thema (Seitenleiste) | Termin oder Thema im Termin | neue Position am Ende |
  | Block | Termin | alle Themen des Blocks |
  | Themenposition | anderer Termin | verschieben samt Verantwortlichen; mit Alt (Mac: Option) kopieren |
  | Themenposition | Thema in anderem Termin | verschieben/kopieren an diese Stelle |
  | Themenposition | Thema im gleichen Termin | Reihenfolge |
  | Person | Thema | als Verantwortliche; auf einen Termin nur, wenn er genau ein Thema hat |
  | Termin (Monatsraster) | anderer Tag | Datum ändern (nur im Planjahr) |
  Vorschläge aus dem Pool kommen mit Phase 8.
- **Kein Ziehen per Tastatur.** Der Tastatursensor von dnd-kit würde mit den
  Knöpfen in denselben Zeilen kollidieren. Jede Aktion hat stattdessen einen
  Klickweg (Spec: „zusätzlich vollständig per Klick bedienbar“): „+“ in der
  Seitenleiste, Pfeile für die Reihenfolge, „In anderen Termin verschieben“ jetzt
  mit Schalter „Kopieren statt verschieben“, Datum über „Termin bearbeiten“.
- **Kopieren:** neue Route `POST /api/dienstplan/termin-themen/[id]/kopie`
  `{ terminId, position? }` (Planer, nur im selben Plan).
- **Monatsraster:** Umschalter „Liste / Monatsraster“. Im Raster steht der
  gewählte Termin als Karte darüber (fest beim Scrollen), damit Themen und
  Personen auch dort per Ziehen oder Klick bearbeitet werden können.
- **Rückgängig/Wiederholen:** Knöpfe und Strg+Z / Strg+Y (Mac: Cmd+Z,
  Cmd+Shift+Z; nicht in Eingabefeldern), bis 50 Schritte je Sitzung im Browser.
  Prinzip: Vor jeder Aktion merkt sich die Maske alle Termine, danach vergleicht
  sie mit dem neu geladenen Plan (`aktualisiert_am`). Ein Eintrag enthält für
  jeden betroffenen Termin den vollständigen Zustand vorher und nachher.
  Wiederhergestellt wird über die neue Route `PUT /api/dienstplan/termine/[id]/zustand`
  (ersetzt Felder, Themen und Verantwortliche in einer Transaktion). Angelegte
  Termine werden beim Rückgängig gelöscht, gelöschte neu angelegt (neue id, die
  Einträge werden umgeschrieben). Plan-Aktionen (Freigabe, „Rhythmus ergänzen“)
  landen bewusst nicht auf dem Stapel.
- **Schutz vor fremden Änderungen:** Die Zustand-Route nimmt `erwartet` (den
  `aktualisiert_am`-Stand nach der eigenen Aktion). Hat jemand anderes den Termin
  inzwischen geändert, antwortet sie 409 statt zu überschreiben; die Maske meldet
  „Rückgängig nicht möglich“. Nach jedem Rückgängig/Wiederholen zieht die Maske
  die Stände aller Einträge für die selbst geänderten Termine nach (sonst würde
  das zweite Rückgängig am selben Termin an der eigenen Änderung scheitern; im
  Browser-Test gefunden und behoben).
- **Vorjahresanzeige:** Zuordnung nach Spec (gleiche Kategorie am Datum minus
  364 Tage, sonst der nächste gleicher Kategorie im Abstand von höchstens 14 Tagen,
  bei Gleichstand der frühere), reine Funktion `vorjahrZuordnen` in kalender.ts.
  Anzeige blass kursiv „2025: Pumpenkunde, Wasserförderung“, „2025: entfallen“
  oder „2025: ohne Thema“. Eingabemaske: Schalter „Vorjahr“, Standard an.
  Präsentation: Standard aus, `?vorjahr=1` oder Taste V; im Anzeige-Dialog
  Häkchen „Vorjahresthemen anzeigen“ (setzt den Parameter in Link und QR-Code).
- **Vorjahr in der Datenbank (Migration 0020):** `dienstplan.vorjahr_themen(jahr)`
  liefert nur Datum, Kürzel, ausgefallen und Thementitel des Vorjahresplans, keine
  Namen und Notizen. Planer sehen das Vorjahr in jedem Status, Mitglieder und der
  Anzeige-Scope nur freigegeben. So bleibt beim Anzeige-Token der eine Plan der
  einzige, dessen Zeilen lesbar sind (Vorgabe Phase 6). SECURITY DEFINER wie
  `kameraden_namen()`; die Funktion setzt für ihre Abfrage die Rolle Mitglied
  (bzw. die eigene) und die Organisation und stellt sie danach wieder her, damit
  sie auch mit einem Eigentümer ohne RLS-Bypass dieselben Policies durchläuft.
- Getestet: test-dienstplan-rueckgaengig.mjs (29), RLS Abschnitt 7, reine
  Funktionen in -kalender und -eingabe, Browser-Durchlauf (Ziehen in alle
  Richtungen, Alt-Kopie, sechsmal Rückgängig bis zum Ausgangszustand, Raster,
  Vorjahr in Eingabe und Präsentation).

### Abweichungen von der Spec
- Kein Ziehen mit der Tastatur (siehe oben); alle Aktionen sind per Klick möglich.
- Rückgängig ist nicht atomar über mehrere Termine: Betrifft ein Schritt zwei
  Termine (Verschieben), sind es zwei Aufrufe. Scheitert der zweite (409), meldet
  die Maske das; der erste bleibt zurückgenommen.

### Offene Fragen
- Keine.

## Phase 8 – Pool, Pflichtthemen, Ausgleich, Mitgliederansicht

### Entscheidungen
- **Keine Migration.** Tabellen und Policies für Vorschläge und Ausgleich gibt es
  seit 0018; Phase 8 baut nur API und Oberfläche.
- **Themenpool:** `GET/POST /api/dienstplan/themenvorschlaege` (alle
  Angemeldeten reichen ein, Spec-Annahme „alle Mitglieder“; Mitglieder sehen nur
  ihre eigenen, Planer alle; `?status=`, `?eigene=1`), `PATCH …/[id]`
  (verwerfen/wieder öffnen, Planer), `POST …/[id]/uebernehmen` `{ terminId? }`
  (Planer). Übernehmen legt das Thema im Katalog an (Beschreibung → Notizen) oder
  nimmt ein vorhandenes gleichen Titels (Groß/klein egal, inaktive werden wieder
  aktiv), setzt den Vorschlag auf „übernommen“ mit Verweis aufs Thema und hängt
  es mit `terminId` ans Ende des Termins. Eingabemaske: Reiter „Pool“ mit
  Einreicher und Datum; Vorschlag auf einen Termin ziehen oder „+“, „Als Thema
  übernehmen“, „Verwerfen“.
- **Pflichtthemen:** Der Hinweis existierte seit Phase 3 (dauerhaft oben in
  Eingabe und Präsentation); jetzt mit Zielgruppe („… (Atemschutzgeräteträger)
  fehlt im Plan“). Seed der Spec als Knopf „Vorschlag übernehmen“ in der
  Verwaltung (`POST /api/dienstplan/themen/pflicht-vorschlag`, idempotent):
  markiert vorhandene Themen mit genau passendem Titel bzw. bekannter
  Schreibweise (z. B. „Sicherheitsbelehrung“ aus dem Import), legt fehlende an.
  Kein Seed in einer Migration, weil der Katalog erst mit dem Import entsteht und
  dort andere Titel stehen. Zielgruppe bleibt ein Hinweis (Spec-Annahme), kein
  Abgleich mit Qualifikationen.
- **Ausgleich:** Liste `ausgleich_personen` pflegt nur der Dienstplan-Admin in
  der Verwaltung (`GET/POST /api/dienstplan/ausgleich`, `DELETE …/[kameradId]`;
  nur aktive Kameraden). Eingabemaske Reiter „Ausgleich“: je Person „3 · Ø 4,2“,
  wenigste oben, Vorjahr in Klammern; wer mindestens 1 und mindestens 25 % unter
  dem Durchschnitt liegt, steht hervorgehoben („deutlich unter“, Spec ohne
  Zahl). Zählung nach Spec: jede Themenposition einmal, ohne K, G, O und ohne
  ausgefallene Termine; Platzhalter aus Altdaten („alle Gruppenführer“) zählen
  nicht. Eine reine Funktion (`zaehleEinteilungen`) für Server (Vorjahr,
  `GET /plaene/[jahr]/ausgleich`) und Maske (aktueller Plan, rechnet nach jeder
  Änderung sofort neu). Personen aus dem Reiter lassen sich direkt auf ein
  Thema ziehen.
- **Import-Seed nur als Vorschlag (Vorgabe Ben):** Das Excel-Blatt
  „Gruppenführer“ ist veraltet. Der Import trägt es nur noch ein, wenn die
  Ausgleichsliste leer ist, und meldet es als Vorschlag; eine gepflegte Liste
  überschreibt er nie (auch nicht mit `--ersetzen`). Checkliste: Liste auf dem
  Server festlegen.
- **Mitgliederansicht `/dienstplan`:** jede angemeldete Person (Mitglieder nur
  freigegebene Pläne, Planer auch Entwürfe mit Kennzeichnung). Standard: Plan des
  laufenden Jahres. „Nächster Termin“ oben (mit Sprung zum aktuellen Monat),
  aktuelle Woche mit Rahmen und „Diese Woche“, vergangene Termine abgeblendet,
  Notizen sichtbar (Spec: „nur im Portal“). Rechts bzw. mobil darunter
  „Themenvorschlag einreichen“ und „Meine Vorschläge“ mit Status. Mobil eine
  Liste ohne seitliches Scrollen.
- Getestet: test-dienstplan-pool.mjs (33, stellt den Themenkatalog danach wieder
  her), reine Funktionen in -eingabe (84), Browser-Durchlauf (Mitglied reicht
  ein, Admin pflegt Ausgleich, Planer zieht den Vorschlag auf einen Termin und
  eine Person aus „Ausgleich“ auf das Thema, Zahl steigt sofort).

### Abweichungen von der Spec
- Links zu iCal-Abo, PDF und Bild in der Mitgliederansicht kommen mit den
  Phasen 10 und 11.
- Rückgängig nach „Vorschlag auf Termin ziehen“ entfernt die Position am Termin,
  der Vorschlag bleibt aber „übernommen“ (und das Thema im Katalog). Gewollt:
  Das Thema ist danach normal im Katalog verfügbar.

### Offene Fragen
- CSV-Import für Kameraden: von Ben am 11.11.2026 freigegeben, umgesetzt vor
  Phase 9 (siehe „CSV-Import Kameraden“).

## Zwischenschritt – CSV-Import Kameraden (Mitgliederverwaltung)

### Entscheidungen
- `/mitglieder` → „CSV importieren“ (nur globaler Admin). Route
  `POST /api/mitglieder/import`, reine Logik in `src/lib/mitglieder/csv-import.ts`.
- Zwei Formate werden erkannt: Tabelle mit Kopfzeile
  `Nachname;Vorname;Spitzname;Personalnummer` (Spalten in beliebiger Reihenfolge,
  `;`, `,` oder Tab; Vorlage zum Herunterladen) und die Anwesenheitsliste der
  Kreis-Mitgliederverwaltung (`lfd. Nr.;;Nachname, Vorname (Personalnummer)`,
  Kopf- und Summenzeilen werden übersprungen). Kodierung UTF-8 oder
  Windows-1252 (der Kreis-Export ist Windows-1252).
- Personalnummern bleiben wie geliefert („002“, „21_034“). Verglichen wird ohne
  führende Nullen und ohne Groß/klein („002“ = „2“).
- Zwei Schritte mit derselben Datei: Vorschau, dann Übernahme der angehakten
  Zeilen. Die Vorschau wird bei der Übernahme auf dem Server neu berechnet; der
  Client schickt nur Datei und Zeilennummern. Ist eine gewählte Zeile inzwischen
  nicht mehr übernehmbar: 409, nichts gespeichert. Alles in einer Transaktion.
- Ergebnis je Zeile: **neu** (angehakt), **ergänzen** (gleicher Name, leere
  Personalnummer bzw. leerer Spitzname wird nachgetragen; angehakt),
  **prüfen** (nicht angehakt: gleicher Name mit anderer Personalnummer, mehrere
  Kameraden gleichen Namens, Name doppelt in der Datei, sieht nach Organisation
  aus wie „… AG (z.Hd. …)“), **vorhanden**, **Konflikt** (Personalnummer gehört
  jemand anderem oder steht doppelt in der Datei).
- Vorhandene Kameraden werden nie überschrieben oder deaktiviert; Personen, die
  in der Liste fehlen, bleiben unverändert. Neue Kameraden: aktiv, ohne Rollen,
  ohne Login, `spitzname_anzeigen` aus. Das Änderungsprotokoll schreibt der
  Trigger (Akteur = Admin).
- Die Datei wird nirgends gespeichert (nur im Browser und im Request).
- Tests: `test-mitglieder-import-lib.mjs` (ohne Server, 22 Prüfungen),
  `test-mitglieder-import.mjs` (Dev-Server, 20), Browser-Durchlauf (Vorschau,
  Handybreite, Übernahme). Alle Namen in Tests erfunden.

### Abweichungen von der Spec
- Keine (die Spec sieht keinen Import vor; Auftrag Ben vom 11.11.2026).

### Offene Fragen
- Keine.

## Phase 9 – Versionen

### Entscheidungen
- **Abbild** (`plan_versionen.inhalt`, `format: 1`): je Termin der vollständige
  Zustand wie beim Rückgängig (Datum, Uhrzeit, Dauer, Kategorie, ausgefallen,
  Ort, Bemerkung, Notizen, Themen mit Verweisen und Block, Verantwortliche) plus
  Termin-id, Quelle, Regel, Rhythmusdatum und die Texte zum Zeitpunkt
  (Thementitel, Anzeigenamen). Reine Logik in `src/lib/dienstplan/versionen.ts`.
- **Freigabe** (PATCH Status, nur Admin) legt in derselben Transaktion eine
  Version mit Anlass `freigabe` an (optional mit Bezeichnung). **Manuell**:
  Planer und Admin mit Pflicht-Bezeichnung. Der Plan wird dabei gesperrt
  (`for update`), die Nummern sind lückenlos je Plan. Die Freigabe fragt in der
  Eingabemaske jetzt nach.
- **Vergleich** zweier Stände (Version ↔ Version oder ↔ aktuell): neu, entfallen,
  verschoben (Datum oder Uhrzeit), geändert (mit Einzelheiten: Thema,
  Verantwortliche, Reihenfolge, Kategorie, abgesagt, Ort, Bemerkung, Notizen,
  Dauer, Block). Zuordnung über die Termin-id, sonst über Datum und Kategorie.
  Umbenennungen von Themen oder Anzeigenamen zählen nicht als Änderung
  (verglichen werden die Verweise). Ohne Angabe: seit der letzten Freigabe.
- **„Geändert am TT.MM.“** (Spec 8): berechnet in `ladePlan` gegen die letzte
  Freigabe-Version, nur bei freigegebenen Plänen; dezenter grauer Punkt mit Text
  in Eingabemaske und Mitgliederansicht. Das Datum ist `aktualisiert_am` des
  Termins. Dafür lesen Mitglieder die Freigabe-Versionen freigegebener Pläne
  (Migration 0021); manuelle Versionen bleiben Planern vorbehalten.
- **Changelog nach Freigabe** (Spec 8) = Vergleich „seit Freigabe“ auf der
  Versionen-Seite; keine eigene Protokolltabelle (die Spec nennt keine, und der
  Vergleich zeigt dieselbe Information).
- **Wiederherstellen** (nur Admin): sichert zuerst den aktuellen Stand als
  manuelle Version „Vor Wiederherstellung von Version N“, setzt einen
  freigegebenen Plan auf Entwurf und gleicht dann ab: Termine, die es noch gibt,
  behalten ihre id (wichtig für stabile iCal-UIDs in Phase 10) und werden nur bei
  Abweichung geschrieben; fehlende werden neu angelegt, überzählige gelöscht.
  Keine Version wird gelöscht. Fehlt ein Thema im Katalog, wird es Freitext mit
  dem Titel zum Zeitpunkt; fehlende Personen oder Blöcke entfallen (Hinweise in
  der Antwort).
- Das Schreiben eines Termin-Zustands ist jetzt eine gemeinsame Funktion
  (`lib/dienstplan/zustand.ts`) für Rückgängig und Wiederherstellen.
- Seite `/dienstplan/[jahr]/versionen` (Planer, Link „Versionen“ in der
  Eingabemaske): Stand speichern, Verlauf, Ansehen (schreibgeschützt),
  Vergleich mit zwei Auswahlfeldern, Wiederherstellen (nur Admin).
- Tests: `test-dienstplan-versionen-lib.mjs` (23), `test-dienstplan-versionen.mjs`
  (34), RLS Abschnitt 8 (112 gesamt), Browser-Durchlauf (Markierung, Vergleich,
  Ansehen, Speichern, Wiederherstellen, Handybreite).

### Abweichungen von der Spec
- Die Präsentation zeigt keine „geändert“-Markierung (sie hebt Änderungen live
  hervor; der Anzeige-Scope liest bewusst keine Versionen).
- Importierte Pläne 2023–2026 haben keine Freigabe-Version (der Import legt
  keine an); bei ihnen gibt es deshalb keine Markierung. Bei Bedarf in der
  Versionen-Seite „Version speichern“.

### Offene Fragen
- Keine.

## Phase 10 – Exporte (CSV-Profile inkl. DIVERA, .ics, Excel)

### Entscheidungen
- **Gemeinsame Termindaten** (`lib/dienstplan/export.ts`, rein): Beginn aus
  Datum/Uhrzeit, Ende = Beginn + Dauer (Termin, sonst Standarddauer der
  Kategorie), über Mitternacht korrekt; ohne Uhrzeit ganztägig. Titel = Themen
  mit „ / “, ohne Thema der Kategoriename. Beschreibung = je Zeile „Thema –
  Verantwortliche“, darunter die Bemerkung. Notizen gehen in keinen Export.
- **CSV nach Profil**: Felder aus Spec 9.5 plus `start`/`ende` (Datum und
  Uhrzeit in einer Spalte), `titelMitKategorie` („Dienstabend: …“) und `fest`
  (fester Wert, z. B. für „Empfänger“). Formate mit YYYY, MM, DD, HH, mm (auch
  JJJJ, TT); ganztägig bleiben Uhrzeitfelder leer. Quoting nach RFC 4180,
  Zeilenende CRLF, Kodierung UTF-8 mit/ohne BOM oder Windows-1252 (Zeichen
  außerhalb werden „?“). Ausgefallene Termine nicht. Profil-Filter
  `nur_freigegeben` (Entwurf → 409) und Kategorien.
- **Seed „DIVERA 24/7“**: `Datum` (DD.MM.YYYY), `Von`, `Bis` (HH:mm), `Titel`
  (mit Kategorie), `Text` (Beschreibung, mehrzeilig in Anführungszeichen),
  `Ort`; `;`, UTF-8 mit BOM. Zweites Profil „DIVERA 24/7 (Beginn/Ende)“ mit
  `Beginn`/`Ende` (DD.MM.YYYY HH:mm) für Termine über Mitternacht. Die Spalte
  `Empfänger` ist bewusst nicht im Seed (Format unbekannt; DIVERA fragt beim
  Import die Empfänger ab). Bei Bedarf in der Verwaltung als „Fester Wert“
  ergänzen.
- **Nur Änderungen**: Je Lauf wird in `export_laeufe.stand` je Termin eine
  Prüfsumme der exportierten Zeile (FNV-1a) plus alter Kopf (Datum, Zeit, Titel)
  gespeichert. Exportiert werden neue und geänderte Termine; die Liste „In
  <Profil> von Hand löschen“ nennt die alte Fassung geänderter und die
  entfallenen Termine (gelöscht, abgesagt, aus dem Filter gefallen). Ohne
  früheren Lauf wie komplett. Halbjahres-Läufe ersetzen nur ihren Bereich im
  Stand. Jeder CSV-Lauf wird protokolliert (auch komplett).
- **.ics** (Download, Jahr oder Halbjahr, optional Kategorien): UID
  `dienstplan-<terminId>@ofwietmarschen.org`, SEQUENCE = Minuten seit 2020 aus
  `aktualisiert_am` (steigt mit jeder Änderung), LAST-MODIFIED, VTIMEZONE
  Europe/Berlin, abgesagte Termine mit `STATUS:CANCELLED` und „Entfällt:“ im
  Titel, Zeilen nach RFC 5545 gefaltet. Kalendername stabil („Dienstplan
  2027“), der Stand steht in `X-WR-CALDESC`. Mitglieder laden nur komplett
  (ohne Protokoll), Planer zusätzlich „nur Änderungen“ (protokolliert mit
  `format = 'ics'`).
- **iCal-Abo**: `/api/dienstplan/abo/<token>.ics` ohne Login. Tabelle
  `ical_abos` (nur Hash, je Organisation ein aktives Abo, Zähler der Abrufe
  und letzter Abruf, damit man sieht, ob Google/DIVERA abrufen). Das Token prüft
  `dienstplan.abo_scope()` in der Datenbank und setzt dann den Lesescope
  Mitglied (nur freigegebene Pläne); keine neuen Policies auf den Plantabellen.
  Inhalt: alle freigegebenen Pläne ab dem Vorjahr. Falsches oder widerrufenes
  Token → 404 ohne Unterscheidung. Erzeugen und Beenden in der Verwaltung (nur
  Admin), die Adresse wird nur einmal angezeigt.
- **Excel** (exceljs): Blätter „1. Halbjahr“, „2. Halbjahr“, „Gesamt“; Spalten
  wie Spec 9.1; Zeile in 20-%-Tönung der Kategoriefarbe, Kürzelzelle voll;
  abgesagte Termine grau und durchgestrichen mit „entfällt“; A4 hoch, an
  Breite angepasst, Kopfzeile wiederholt, Legende, Fußzeile mit Stand und
  Seitenzahl. Farben für Dateien in `lib/dienstplan/druckfarben.ts` (Spec 7.1).
- **Oberfläche**: Eingabemaske → „Export“ (CSV nach Profil, iCal, Excel,
  Löschliste, letzte Exporte); Verwaltung → „Exportprofile (CSV)“ (Admin
  bearbeitet Spalten mit Feld, Format, festem Wert, Reihenfolge) und „iCal-Abo“
  (Admin); Mitgliederansicht → Karte „Herunterladen“ (Kalender .ics für
  Halbjahr oder Jahr).
- Tests: `test-dienstplan-export-lib.mjs` (45), `test-dienstplan-export.mjs`
  (52), RLS Abschnitt 9 (131 gesamt), Routen-Test (Abo-Feed 404 ohne/mit
  falschem Token), Browser-Durchlauf (Export-Fenster mit Löschliste, Downloads,
  Profilformular, Abo erzeugen, Mitglied lädt .ics auf Handybreite).

### Abweichungen von der Spec
- Der Mitgliederansicht fehlt ein iCal-**Abo**-Link: Die Abo-Adresse sieht nur
  der Admin einmalig (nur Hash gespeichert). Mitglieder abonnieren wie bisher
  den freigegebenen Google-Kalender oder laden die .ics-Datei.
- Halbjahres-Download im Abo-Feed gibt es nicht (Abo = alle freigegebenen
  Pläne ab dem Vorjahr).

### Offene Fragen
- Verhalten von Google-Kalender-Import und DIVERA bei erneutem Import gleicher
  UIDs bzw. beim Abo-Link (aktualisieren oder Dubletten) – Test am
  Deployment-Tag, siehe DEPLOYMENT_TAG.md. Je nach Ergebnis ist CSV oder Abo
  der Weg nach DIVERA.
- Format der DIVERA-Spalte „Empfänger“ (siehe oben).

## Phasen 11–13

### Entscheidungen
### Abweichungen von der Spec
### Offene Fragen
