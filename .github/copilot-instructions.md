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
  `node scripts/migrate.mjs` (npm run db:migrate). Nie mit fw_app migrieren,
  nie `drizzle-kit migrate` (verschluckt Fehler).
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
- withGlobalAdminScope(user): setzt app.psa_rolle und app.app_rolle auf
  'Admin'. **Nur nach requireGlobalAdmin() (API) bzw.
  requireGlobalAdminPage() (Seiten) und im Erst-Setup verwenden**, nie mit
  einem ungeprüften Benutzer
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
  /api/admin/rollen/[kameradId] (globaler Admin). Alle anderen Routen
  ignorieren sie
- KRITISCH: Das postgres_data-Volume in docker-compose.yml ist external
  (name: setup_postgres_data) — verweist auf dasselbe physische Volume,
  das der psa-verwaltung-Setup-Stack nutzt. NIEMALS zwei Postgres-
  Container gleichzeitig auf dieses Volume zugreifen lassen. NIEMALS
  docker compose down mit -v/--volumes in diesem Zusammenhang ausführen

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
| Kamerad deaktiviert → verknüpfte Benutzer in DERSELBEN Transaktion deaktiviert, token_version + 1 | deaktiviereBenutzerVonKamerad (lib/benutzer-admin.ts) in api/psa/kameraden PATCH (aktiv=false) und DELETE. Reaktivieren eines Benutzers mit inaktivem Kameraden → 409 | Umgesetzt. Jede neue Stelle, die kameraden.aktiv schreibt, muss das aufrufen |
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
