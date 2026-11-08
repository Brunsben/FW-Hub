# FW-Hub – Kontext für Copilot

## Was das hier ist
FW-Hub ist die konsolidierte Feuerwehr-Verwaltungssoftware, Nachfolger von
feuerwehr-portal (jetzt feuerwehr-portal-legacy, archiviert). Module:
PSA-Verwaltung, Küche/FoodBot, Führerscheinkontrolle, Funktechnik — alle in
EINER Next.js-Codebasis, keine separaten Repos/Deployments pro Modul.

## Stack (verbindlich für alle Module)
- Next.js (App Router), TypeScript
- Drizzle ORM, direkter Zugriff auf die gemeinsame Postgres-Instanz
  (kein PostgREST)
- Auth: eigenes JWT-System (KEIN Auth.js/NextAuth), ein Login für alle
  Module, pro-Modul-Rollen-Claims im Payload (psa_rolle, food_rolle,
  fk_rolle, funk_rolle), jedes Modul liest nur seinen eigenen Claim
- Rollenscoped Postgres-Verbindungen + Row-Level-Security als zusätzliche
  Absicherung
- shadcn/ui + Tailwind als gemeinsame Komponentenbibliothek
- Strukturelle Vorlage für neue Module: FK-App (sauberes Next.js/Drizzle-
  Muster). NICHT feuerwehr-portal-legacy als Vorlage nehmen — das Repo
  enthielt Vue-Reste und zwei parallele, sich widersprechende Auth-Systeme

## Datenbank
- Gemeinsame Postgres-Instanz, Schema core (kameraden, benutzer,
  login_attempts) plus ein Schema pro Modul (psa, fw_food, fk, fw_funk)
- Schema pv_monitoring (PV-Anlagen-Daten) wird NICHT angefasst

### Rollen und Verbindungen
- DATABASE_URL → fw_app (NOBYPASSRLS, kein Superuser). Die App läuft
  ausschließlich damit, RLS greift.
- AUTH_DATABASE_URL → fw_auth (BYPASSRLS, KEIN Superuser). Nur für Login,
  Sperre (core.login_attempts) und den Session-Check in getAuthUser(). Darf
  core.benutzer nur LESEN.
- MIGRATE_DATABASE_URL → Owner-Rolle. NUR für Migrationen über
  `node scripts/migrate.mjs` (npm run db:migrate). Wendet alle ausstehenden
  Migrationen in einer Transaktion an; `--bis 0012` begrenzt den Lauf auf eine
  Nummer. Auf dem Server: `docker compose run --rm migrate [--bis 0012]`
  (Service "migrate", Profil "migrate", läuft nicht bei `docker compose up`).
  Nie mit fw_app migrieren, nie `drizzle-kit migrate` (verschluckt Fehler).
- Startschutz (src/instrumentation.ts → lib/db/startup-check.ts): In
  Produktion bricht der Start ab, wenn AUTH_DATABASE_URL fehlt, die
  Hauptverbindung Superuser/BYPASSRLS hat oder die Auth-Verbindung Superuser
  ist. In Entwicklung nur eine Warnung.
- **Lokal nie als Superuser testen.** Superuser und BYPASSRLS umgehen RLS,
  solche Tests sind für die Rechteprüfung wertlos. Tests laufen als fw_app,
  der Owner nur für Setup, Kontrolle und Aufräumen.
- Neue Tabellen in core, psa oder fw_funk bekommen über ALTER DEFAULT
  PRIVILEGES automatisch Rechte für fw_app. Tabellen, die nur fw_auth gehören,
  danach mit REVOKE bereinigen (siehe drizzle/manual/create-fw-app-role.sql).

### RLS-Scopes (src/lib/db/scoped.ts)
Jeder Zugriff auf RLS-Tabellen (core.kameraden, core.benutzer,
core.login_attempts, psa.ausruestungstuecke, psa.ausgaben, psa.pruefungen,
psa.waesche, psa.schadensdokumentation, psa.kamerad_details,
fw_food.registrations, fw_food.mobile_tokens) läuft in einem Scope, der die
app.*-GUCs transaktionslokal setzt.

Policy-Muster für ALLE PSA-Tabellen (Migrationen 0010 und 0011):
`<t>_priv` FOR ALL für app.psa_rolle Admin/Kleiderwart und
`<t>_eigene_lesen` FOR SELECT für die eigenen Zeilen. User lesen nur eigene
Zeilen und schreiben in PSA-Tabellen nie, auch nicht eigene.
- ausruestungstuecke, ausgaben, pruefungen, waesche, kamerad_details: eigene
  Zeile = kamerad_id = app.kamerad_id
- schadensdokumentation (keine kamerad_id): eigene Zeile = Schaden an einem
  Stück, dessen aktueller Träger der Benutzer ist (Unterabfrage auf
  ausruestungstuecke, läuft selbst unter RLS)
- Die frühere Policy ausruestungstuecke_scope (FOR ALL inkl. eigener
  Schreibrechte) ist durch 0011 ersetzt und wird nirgends mehr angelegt.
Neue PSA-Tabellen folgen diesem Muster.

Scopes:
- withScope({ kameradId, psaRolle }): PSA und eigene Zeile
- withFoodScope({ kameradId, foodRolle }): Küchen-Admin, darf core.kameraden
  nur lesen. Karten-IDs schreibt ausschließlich core.set_karten_id
  (SECURITY DEFINER)
- withFoodPublicScope(): bewusst login-frei für Kiosk/Mobile
  (app.food_public='true'). Pfade: /api/food/register, /api/food/stats,
  /food/m/[token] (sowie food-utils-Helfer, die von dort die Transaktion
  erhalten). Darf core.kameraden lesen, fw_food.registrations
  lesen/schreiben. Nicht für weitere Pfade verwenden
- withFunkScope({ kameradId, funkRolle }): Funk-Admin/Gerätewart lesen
  core.kameraden
- withGlobalAdminScope(user): setzt NUR app.app_rolle auf 'Admin' (kein
  psa_rolle mehr). Darauf stützen sich die Policies auf core.kameraden und
  core.benutzer. **Nur nach requireGlobalAdmin() (API) bzw.
  requireGlobalAdminPage() (Seiten) und im Erst-Setup verwenden**, nie mit
  einem ungeprüften Benutzer
- withGlobalAdminPsaScope(user): wie oben plus app.psa_rolle='Admin'. Nur für
  globale Admin-Aktionen auf PSA-Tabellen (Stück-Löschen)
- Schreibende Transaktionen auf RLS-Tabellen prüfen die Zahl der
  betroffenen Zeilen (expectRows). 0 Zeilen bedeutet Abbruch, kein stiller
  Erfolg

### Sessions (src/lib/auth.ts)
- Das JWT trägt benutzer_id und tv (= core.benutzer.token_version) neben
  den Rollen-Claims. Tokens ohne diese Claims sind ungültig
- getAuthUser() verifiziert das JWT (exp Pflicht) und prüft danach live über
  fw_auth: Benutzer aktiv, token_version, kamerad_id und Rolle stimmen.
  Alle Modul-Sessions laufen darüber
- token_version erhöhen bei Deaktivierung, PIN-Änderung (eigene oder
  Admin-Reset), Rollenänderung (App-Rolle oder Modulrollen) und "überall
  abmelden". Alte Tokens sind damit beim nächsten Request ungültig
- Modulrollen-Spalten in core.kameraden schreibt NUR
  /api/admin/rollen/[kameradId] (globaler Admin) über die SECURITY-DEFINER-
  Funktion core.set_kamerad_rollen (prüft app.app_rolle='Admin', erhöht
  token_version der Benutzer). fw_app hat auf diese Spalten kein INSERT/UPDATE
  (Spaltenrechte, Migration 0013). Alle anderen Routen ignorieren sie
- KRITISCH: Das postgres_data-Volume in docker-compose.yml ist external
  (name: setup_postgres_data) — verweist auf dasselbe physische Volume,
  das der psa-verwaltung-Setup-Stack nutzt. NIEMALS zwei Postgres-
  Container gleichzeitig auf dieses Volume zugreifen lassen. NIEMALS
  docker compose down mit -v/--volumes in diesem Zusammenhang ausführen

### core.kameraden / core.benutzer: Rechte (Migrationen 0012/0013)
- Spaltenrechte fw_app auf core.kameraden: INSERT/UPDATE nur auf name, vorname,
  dienstgrad, email, personalnummer, aktiv (UPDATE zusätzlich updated_at).
  Kein DELETE. karten_id nur über core.set_karten_id (Food-Admin), Rollen nur
  über core.set_kamerad_rollen (globaler Admin). SELECT bleibt tabellenweit,
  begrenzt durch RLS
- Anlegen von Kameraden: Drizzle-INSERT nennt ALLE Spalten der Tabellendefinition.
  Darum nur über `kameradenStammdaten` (src/lib/db/kameraden-stamm.ts), nicht
  über `kameraden`. Diese Teilsicht gehört bewusst nicht in schema.ts
- Policies core.kameraden: kameraden_lesen (eigene Zeile, psa_rolle
  Admin/Kleiderwart, app_rolle Admin), kameraden_anlegen und kameraden_aendern
  (psa_rolle Admin/Kleiderwart, app_rolle Admin), dazu die Lese-Policies für
  Food und Funk. Es gibt keine DELETE-Policy
- Policies core.benutzer: benutzer_select (globaler Admin alles, sonst die
  eigene Zeile), benutzer_insert/update/delete nur app_rolle Admin. Auch PSA-
  Admin/Kleiderwart schreiben core.benutzer nicht direkt
- Eigene PIN und "überall abmelden" laufen über core.eigene_pin_setzen und
  core.eigene_sitzungen_beenden (nur die Zeile mit kamerad_id =
  app.kamerad_id; ein direktes UPDATE der eigenen Zeile würde auch rolle
  erlauben)
- Grenze: app.* sind von der App gesetzte GUCs. fw_app kann sie technisch frei
  setzen, die Policies und Funktionen schützen vor Fehlern in Routen, nicht
  vor kompromittiertem App-Code

### Produktion: Ausroll-Checkliste Härtung (Migrationen 0012/0013)
Befehle gegen den Server führt der Mensch aus, nicht Claude Code. Migrationen
laufen auf Produktion über den Compose-Service `migrate` (Dockerfile-Stage
`migrate`: scripts/migrate.mjs, drizzle/-SQL und Journal). Das App-Image enthält
sie nicht, der Container startet nur `node server.js`, und CI baut nur
(type-check, build). Der Service hängt im Netz fw-network, verbindet als
POSTGRES_USER mit POSTGRES_PASSWORD (nicht als fw_app) und startet nicht bei
`docker compose up`.

Was man wissen muss
- `docker compose run --rm migrate` ohne Argument wendet ALLE ausstehenden
  Migrationen in EINER Transaktion an. 0012 und 0013 liefen dann zusammen
  (atomar, aber ohne App-Ausrollen dazwischen). Für die getrennte Reihenfolge:
  `docker compose run --rm migrate --bis 0012`, später derselbe Aufruf ohne
  Argument
- Nach jedem `git pull` das Image neu bauen (`docker compose build migrate`),
  sonst fehlen neue Migrationen im Dienst
- `docker compose run` startet bei Bedarf den Service postgres (depends_on).
  Das ist der normale Server-Postgres, kein zweiter Container auf dem Volume
- 0012 ist additiv (alte App läuft weiter), 0013 entzieht Rechte (alte App
  bricht). Reihenfolge deshalb: 0012, dann App, dann 0013
- 0012 setzt ENABLE und FORCE ROW LEVEL SECURITY auf core.kameraden und
  core.benutzer selbst (idempotent). Ohne RLS wären die Policies wirkungslos
  für Zeilen. Auf Produktion ist es schon aktiv, dort ändert es nichts

Schritte
1. **Vorbereitung**: Lokal tsc, Build, test-haertung.mjs und test-ui-a.mjs
   grün. Auf dem Server den Stand holen und das Migrations-Image bauen:
   `docker compose build migrate`. Test-Konten für den Smoke-Test festlegen: ein
   Testkamerad mit Benutzer, klar benannt (z. B. "Test-Rollout"). Kameraden
   werden nie gelöscht, der Testkamerad bleibt danach inaktiv
2. **Wartungsfenster** ankündigen (30 Minuten reichen): Kiosk-Anmeldung /food
   und PSA-Pflege kurz nicht nutzen. Die Migration dauert Sekunden, der
   App-Neustart unter einer Minute
3. **Backup** und Stand erfassen
   - `docker exec fw_postgres pg_dump -U <POSTGRES_USER> -Fc <POSTGRES_DB> > fwhub-vor-haertung-<datum>.dump`
   - Datei prüfen (`pg_restore --list <datei>`) und außerhalb des Servers
     ablegen. Nie `docker compose down -v` (das Volume setup_postgres_data ist
     external)
   - Als Owner im psql erfassen, Sollwerte vor dem Start:
     ```sql
     select count(*) from drizzle.__drizzle_migrations;            -- 12
     select count(*) from pg_policies where schemaname = 'core';   -- 5
     select relname, relrowsecurity, relforcerowsecurity
       from pg_class
      where oid in ('core.kameraden'::regclass, 'core.benutzer'::regclass); -- beide t/t
     select count(*) from core.benutzer where rolle = 'Admin' and aktiv;   -- mindestens 1
     select distinct tableowner from pg_tables where schemaname = 'core';  -- = POSTGRES_USER
     ```
4. **Migrationsrolle prüfen**: Der Service migriert als POSTGRES_USER. Die
   letzte Abfrage oben muss genau diese Rolle zeigen, sonst fehlen ihr Rechte an
   den Tabellen. Die frühere Pflicht, den Eigentümer von set_karten_id auf eine
   Rolle mit RLS-Bypass zu stellen, entfällt ab 0012 (die Funktion arbeitet
   jetzt ohne Bypass)
5. **Migration 0012**: `docker compose run --rm migrate --bis 0012`, erwartet
   "12 -> 13" in der Ausgabe. Prüfen:
   `select count(*) from pg_policies where schemaname = 'core'` ergibt 12 (alte
   und neue Policies), `relrowsecurity` und `relforcerowsecurity` sind für
   kameraden und benutzer `t`, Trigger `kameraden_deaktiviert_benutzer` auf
   core.kameraden vorhanden, Funktionen eigene_pin_setzen,
   eigene_sitzungen_beenden, kamerad_deaktiviert, set_kamerad_rollen und
   set_karten_id in core. Die alte App läuft weiter: Login und /psa öffnen
6. **App ausrollen** (neues Image bauen, Container neu starten, nie mit `-v`).
   Prüfen: /api/health ist ok, der Start-Schutz meldet im Log keinen Fehler.
   Kurzer Smoke gegen den additiven Stand: Login, /admin/benutzer, /psa
7. **Migration 0013**: `docker compose run --rm migrate`, erwartet "13 -> 14".
   Prüfen: Policies in core = 10, kameraden_scope und benutzer_scope sind weg.
   Dann die Rechte:
   ```sql
   select has_table_privilege('fw_app', 'core.kameraden', 'INSERT'),            -- f
          has_table_privilege('fw_app', 'core.kameraden', 'DELETE'),            -- f
          has_column_privilege('fw_app', 'core.kameraden', 'karten_id', 'UPDATE'),  -- f
          has_column_privilege('fw_app', 'core.kameraden', 'psa_rolle', 'UPDATE'),  -- f
          has_column_privilege('fw_app', 'core.kameraden', 'name', 'UPDATE');       -- t
   ```
8. **Smoke-Test** mit den Test-Konten, nicht mit echten Mitgliedern:
   | Test | Erwartung |
   |---|---|
   | Login als Admin, Kleiderwart und User | Anmeldung klappt, Kacheln passend zur Rolle |
   | PIN ändern (Test-User unter /profil) | Erfolg. Eine zweite offene Sitzung dieses Benutzers landet nach Reload auf /login. Login mit neuer PIN klappt |
   | Kamerad deaktivieren (Kleiderwart in /psa, Testkamerad mit Konto) | Kamerad inaktiv, Konto in /admin/benutzer inaktiv, Login des Kontos scheitert. Den eigenen Kameraden deaktivieren → 409 mit Meldung |
   | Karten-ID setzen (Küche-Verwaltung, Testkamerad) | Gespeichert. Dieselbe ID bei einem anderen Kameraden → 409. Im PSA-Formular ist das Feld schreibgeschützt. Anmeldung mit der Testkarte am Kiosk /food klappt |
   | Rollen ändern (Admin in /admin/benutzer, Testkamerad) | Rolle setzen und entfernen klappt. Das Konto des Testkameraden muss sich neu anmelden. Ein Kleiderwart kann keine Rollen ändern |
   | Kamerad anlegen (Kleiderwart in /psa) | Stammdaten werden gespeichert |
   | /food (Kiosk) und /funk als Funk-Admin | Seiten laden, Kameradenlisten erscheinen |
9. **Abschluss**: Testkamerad bleibt inaktiv. Backup-Datei bis zum nächsten
   Tag aufbewahren. Uptime Kuma grün. drizzle/manual/create-fw-app-role.sql darf
   danach wieder laufen (die Einschränkungen sind eingebaut). Die
   Passwort-Platzhalter vorher durch die echten Passwörter ersetzen, sonst
   setzt das Skript die Passwörter von fw_app und fw_auth zurück

Rückweg
- 0012 schlägt fehl: Es ist eine Transaktion, nichts wurde angewendet. Ursache
  lesen, nichts nacharbeiten
- Probleme nach dem App-Ausrollen, vor 0013: Vorheriges Image starten. 0012 ist
  mit der alten App verträglich
- Probleme nach 0013: Vorheriges Image starten UND das Rücknahme-SQL aus dem
  Kopf von drizzle/0013_kameraden_benutzer_haertung_restriktiv.sql als Owner
  ausführen. Funktionen und Trigger aus 0012 dürfen bleiben. Der Eintrag für 0013
  bleibt in drizzle.__drizzle_migrations, ein späteres erneutes Anwenden
  braucht bewusst das Löschen der Zeile mit dem höchsten created_at
- Letzter Ausweg: Restore aus dem Backup (Änderungen seit dem Backup gehen
  verloren)

## Oberfläche
- Farben nur über Theme-Tokens aus src/app/globals.css (bg-background,
  bg-card, text-foreground, text-muted-foreground, border-border, bg-primary,
  bg-destructive, bg-success, border-warning usw.). Keine festen Farbklassen
  (bg-white, text-gray-*, bg-green-600 …) und keine Hex-Werte in Komponenten.
  Einzige Ausnahme: die QR-Code-Ruhezone (bg-white, sonst nicht scanbar)
- Hell- und Dunkelwerte stehen in `:root` und `.dark`. Neue Tokens in beiden
  Blöcken UND in `@theme inline` anlegen, Textkontrast mindestens 4,5:1
  (WCAG AA) in beiden Themes prüfen
- Dunkelmodus über next-themes: ThemeProvider im Root-Layout (Klasse `dark`
  am `<html>`, Standard System). Umschalter (components/theme-toggle.tsx) in
  der Kopfzeile sowie auf /login und /setup
- Portalseiten liegen in src/app/(portal)/ und bekommen die Kopfzeile
  (components/app-header.tsx) vom Layout. Nicht pro Seite einbinden.
  Außerhalb des Rahmens bleiben der Kiosk /food, /food/m/[token], /login,
  /setup und /api
- Primärfarbe ist Feuerwehr-Rot als Token: hell `#c8102e`, dunkel `#ff6b6b`
  (mit dunklem Vordergrund). Kontrast prüfen mit `node scripts/kontrast.mjs`:
  Text mindestens 4,5:1, Bedienelemente (Eingaberand `--input`, Fokusring
  `--ring`, Primär-Fläche) mindestens 3:1, in beiden Themes
- Einheitliche Maße: Seitenwurzel `<main className="mx-auto flex w-full
  max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">`, Überschrift
  `<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">`,
  Feldgruppen `grid gap-2`, Formulare `grid gap-4`
- Kopfzeile ab md in einer Zeile, darunter (Handy) als Menü
  (components/header-mobile-menu.tsx, Sheet). Ein neues Portal-Modul wird nur
  in `sichtbareModule()` (app-header.tsx) und `MODUL_ICONS`
  (components/modul-icons.ts) eingetragen; Kopfzeile, Handy-Menü und
  Startseiten-Kacheln folgen daraus
- Tabellen immer mit components/ui/table (Kopf hinterlegt, Zeilen mit Hover,
  unter md seitlich scrollbar). Leere Liste: eine Zeile mit
  `className="py-10 text-center text-muted-foreground"` und kurzer Meldung
- `<Button loading={busy}>` für asynchrone Aktionen (Spinner, gesperrt)
  statt nur `disabled`. Tastaturfokus bleibt sichtbar: Komponenten nutzen
  `focus-visible:ring-ring/80`, Links den globalen Outline aus globals.css
- Nach `npx shadcn@latest add …` package.json und package-lock.json prüfen:
  Der Generator hat `sheet.tsx` mit `import { cn } from "cn"` und der fremden
  npm-Abhängigkeit `cn` erzeugt. Import auf `@/lib/utils` umstellen und das
  Paket mit `npm uninstall cn` wieder entfernen

## Verbindliche System-Invarianten
Eine Invariante hat NIE nur einen Durchsetzungsort. Bei jeder neuen Regel
IMMER nach allen Stellen suchen (Schema, Erst-Setup, laufender Betrieb,
Frontend-Formulare) — siehe invariant-checker.agent.md für das Vorgehen.

| Invariante | Durchgesetzt durch | Status |
|---|---|---|
| kamerad_id ist im JWT für JEDEN Account gesetzt, niemals null (auch nicht für Admin) | Schema NOT NULL + Erst-Setup legt bei Bedarf Kameraden-Datensatz mit an (Henne-Ei-Problem) + laufende Benutzer-Anlage (/api/admin/benutzer: Kamerad Pflicht, aktiv, noch ohne Account) | Umgesetzt |
| Jedes Modul referenziert Kameraden.id direkt, führt KEINE eigene Mitgliederliste | Schema-Design | Bekannter Stolperstein — Funk-App hatte versehentlich eine eigene users-Tabelle gebaut, wurde korrigiert. Bei jedem neuen Modul explizit prüfen |
| Pro-Modul-Rollen-Claim (z.B. funk_rolle) wird bei Login ausgestellt | Schema-Spalte + Login-Route | Pro Modul einzeln aufzubauen |
| exp-Claim ist bei JEDER Verifizierung Pflicht | requiredClaims: ["exp"] in verifyJwt (einziger jwtVerify-Aufruf) | Umgesetzt |
| pv_monitoring-Schema unangetastet | Konvention, keine technische Sperre | Einzuhalten |
| core.kameraden wird nie hart gelöscht, nur über aktiv=false (Soft-Delete) | Durchsetzung in jeder DELETE-Route, die Kameraden anfasst | Ab PSA-Migration eingeführt, für alle künftigen Module verbindlich |
| Kamerad deaktiviert → verknüpfte Benutzer in DERSELBEN Transaktion deaktiviert, token_version + 1 | Trigger kameraden_deaktiviert_benutzer (core.kamerad_deaktiviert, Migration 0012): AFTER UPDATE OF aktiv true→false, egal wer das UPDATE auslöst. Gleiche Schutzregeln wie vorher (eigener Kamerad, letzter Admin → SQLSTATE FW001 → 409). Reaktivieren eines Benutzers mit inaktivem Kameraden → 409 in /api/admin/benutzer/[id] | Umgesetzt. Keine App-Pflicht mehr, jede neue Stelle ist automatisch abgedeckt |
| Es bleibt immer mindestens ein aktiver globaler Admin. Kein Admin deaktiviert oder degradiert sich selbst | assertAdminsRemain (FOR UPDATE) in /api/admin/benutzer/[id] und in der Kamerad-Deaktivierung + Selbstschutz in denselben Routen | Umgesetzt |
| psa.ausruestungstuecke mit Historie (Ausgabe, Prüfung, Wäsche, Schaden) wird nie gelöscht, sondern auf Status "Ausgesondert" gesetzt | DELETE /api/psa/ausruestungstuecke: nur globaler Admin, nur ohne Historie, sonst 409 mit Verweis auf "Ausgesondert" (Zeile FOR UPDATE gesperrt). Die FKs sind ON DELETE CASCADE, ein Löschen würde die Historie mitreißen | Umgesetzt. Gilt auch für künftige Routen und Skripte |
| Benutzernamen case-insensitiv eindeutig | Unique-Index idx_benutzer_benutzername_lower + Prüfung in /api/admin/benutzer | Umgesetzt |

## Modul-Übersicht
| Modul | Route | Quelle | Status |
|---|---|---|---|
| PSA-Verwaltung | /psa | psa-verwaltung (Vue 3 + PostgREST) | Migration ausstehend |
| Küche/FoodBot | /food | FoodBot (Flask/SQLite) | Migration ausstehend, RFID auf HID-Tastatur-Emulation |
| Führerscheinkontrolle | /fk | FK-App | Struktur bereits übernommen, Business-Logik-Migration ausstehend |
| Funktechnik | /funk | Neu, siehe FUNK_APP_SPEC.md | Datenmodell spezifiziert, Implementierung ausstehend. Referenz für Auth-Pattern: Funk-App/lib/funk-auth.ts (dort korrekt gegen Kameraden.id gebaut) — Funk-App selbst NICHT weiterverwenden, nur als Vorlage lesen |

## Grundregel für ALLE Agents: Erst verifizieren, dann berichten
Nach JEDER Datei-Operation (Schreiben, Kopieren, Umbenennen, Löschen) den
tatsächlichen Zustand unabhängig gegenprüfen (Datei erneut lesen, Ordner
auflisten), BEVOR ein Erfolg gemeldet wird. Ein Tool-Rückgabewert allein
ist kein Beleg — insbesondere bei Netzlaufwerk-/UNC-Pfaden können Schreib-
operationen am falschen Ziel ankommen, ohne dass ein Fehler auftritt. Im
Zweifel: Pfad explizit nennen und den Nutzer bitten, selbst mit dir/ls
oder git status gegenzuprüfen, statt einen ungeprüften Erfolg zu melden.
