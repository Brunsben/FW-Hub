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
  fk_rolle, funk_rolle, dienst_rolle), jedes Modul liest nur seinen eigenen Claim
- Rollenscoped Postgres-Verbindungen + Row-Level-Security als zusätzliche
  Absicherung
- shadcn/ui + Tailwind als gemeinsame Komponentenbibliothek
- Strukturelle Vorlage für neue Module: FK-App (sauberes Next.js/Drizzle-
  Muster). NICHT feuerwehr-portal-legacy als Vorlage nehmen — das Repo
  enthielt Vue-Reste und zwei parallele, sich widersprechende Auth-Systeme

## Datenbank
- Gemeinsame Postgres-Instanz, Schema core (kameraden, benutzer,
  login_attempts) plus ein Schema pro Modul (psa, fw_food, fk, fw_funk,
  dienstplan)
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
  Nummer. Auf dem Server über `scripts/server-migrate.sh`, siehe "Produktion:
  Server-Struktur und Migrationen". Nie mit fw_app migrieren, nie
  `drizzle-kit migrate` (verschluckt Fehler).
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
- Schema dienstplan hat KEINE Default Privileges: Jede Migration vergibt die
  Rechte für ihre neuen Tabellen selbst (GRANT, siehe 0018).
  create-fw-app-role.sql fasst dienstplan nicht an.

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
- withDienstplanAnzeigeScope(tokenHash): Präsentation ohne Login (Migration
  0019). Setzt nur app.dienst_rolle='Anzeige' und app.dienst_anzeige (SHA-256
  des Anzeige-Tokens); sichtbar ist dann nur der Plan des gültigen Tokens, nur
  lesend. Nur über anzeigeRoute (lib/dienstplan/anzeige.ts), einziger Pfad
  /api/dienstplan/anzeige/[jahr]. Nicht für weitere Pfade verwenden
- withDienstplanAboScope(tokenHash): iCal-Abo ohne Login (Migration 0022). Ruft
  dienstplan.abo_scope(hash) auf; die Datenbank prüft das Token (ical_abos,
  nicht widerrufen), zählt den Abruf und setzt für die Transaktion den
  Lesescope Mitglied der Organisation des Tokens (app.kamerad_id = 0), also nur
  freigegebene Pläne. Ungültig → null (Route 404). Einziger Pfad
  /api/dienstplan/abo/[token] (lib/dienstplan/abo.ts). Nicht für weitere Pfade
  verwenden
- withDienstplanScope({ kameradId, dienstRolle, organisationId }): setzt
  app.kamerad_id, app.dienst_rolle und app.dienst_org für alle Tabellen in
  dienstplan (Migration 0018). Immer aus requireDienstplanSession()
  (lib/dienstplan/auth.ts) bilden. Ohne dienst_rolle gilt eine angemeldete
  Person als Mitglied. Namen von Kameraden liest das Modul nur über
  dienstplan.kameraden_namen() (Namensfelder und aktiv), nie core.kameraden
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
- Modulrollen-Spalten in core.kameraden (psa_rolle, food_rolle, fk_rolle,
  funk_rolle, dienst_rolle) schreibt NUR
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
  dienstgrad, email, personalnummer, spitzname, spitzname_anzeigen (seit 0016),
  aktiv (UPDATE zusätzlich updated_at). Neue Spalten bekommen diese Rechte nicht
  automatisch: In der Migration GRANT INSERT/UPDATE (spalte) ergänzen und die
  Spalte in core.kameraden_audit aufnehmen.
  Kein DELETE. karten_id nur über core.set_karten_id (Food-Admin), Rollen nur
  über core.set_kamerad_rollen (globaler Admin). SELECT bleibt tabellenweit,
  begrenzt durch RLS
- Anlegen von Kameraden: Drizzle-INSERT nennt ALLE Spalten der Tabellendefinition.
  Darum nur über `kameradenStammdaten` (src/lib/db/kameraden-stamm.ts), nicht
  über `kameraden`. Diese Teilsicht gehört bewusst nicht in schema.ts
- Policies core.kameraden: kameraden_lesen (eigene Zeile, psa_rolle
  Admin/Kleiderwart, app_rolle Admin), kameraden_anlegen und kameraden_aendern
  **nur app_rolle Admin** (Migration 0015; bis 0014 durften auch psa_rolle
  Admin/Kleiderwart schreiben), dazu die Lese-Policies für Food und Funk. Es
  gibt keine DELETE-Policy. PSA Admin/Kleiderwart lesen alle Kameraden und
  pflegen nur noch die Größen (psa.kamerad_details)
- Policies core.benutzer: benutzer_select (globaler Admin alles, sonst die
  eigene Zeile), benutzer_insert/update/delete nur app_rolle Admin. Auch PSA-
  Admin/Kleiderwart schreiben core.benutzer nicht direkt
- Eigene PIN und "überall abmelden" laufen über core.eigene_pin_setzen und
  core.eigene_sitzungen_beenden (nur die Zeile mit kamerad_id =
  app.kamerad_id; ein direktes UPDATE der eigenen Zeile würde auch rolle
  erlauben)
- Änderungsprotokoll `core.mitglieder_audit` (Migration 0014): wer, wann, welcher
  Kamerad, Abschnitt (stammdaten, zugang, rollen), Feld, alter und neuer Wert.
  Geschrieben von Triggern auf core.kameraden und core.benutzer (jeder Pfad ist
  abgedeckt, auch Funktionen und der Deaktivierungs-Trigger), nie von der App.
  PIN und PIN-Hash stehen nie darin (nur das Ereignis "pin: geändert"). fw_app
  darf nur lesen, und nur als globaler Admin (RLS). Kein Fremdschlüssel, damit das
  Protokoll unabhängig von den Daten bleibt. Tests, die Kameraden löschen, löschen
  vorher deren Protokolleinträge über die gemerkten IDs
- Grenze: app.* sind von der App gesetzte GUCs. fw_app kann sie technisch frei
  setzen, die Policies und Funktionen schützen vor Fehlern in Routen, nicht
  vor kompromittiertem App-Code

### Produktion: Server-Struktur und Migrationen
Befehle gegen den Server führt der Mensch aus, nicht Claude Code.

Aufbau auf dem Server
- Repo: `~/fw/FW-Hub` (Quelle für App-Image und Migrations-Image)
- Stack: `~/fw/fwhub-stack` mit eigener docker-compose.yml. Sie enthält nur den
  Service `portal` (Build-Kontext `../FW-Hub`) und hängt am externen Netz
  `fw-network`
- Postgres: Container `fw_postgres`, gehört zum Compose-Projekt
  `feuerwehr-portal` (nicht zum Stack). Datenbank `fwhub`
- Die docker-compose.yml im Repo (mit Service `migrate`) ist die
  Entwicklungs- und Referenzdatei. Auf dem Server wird sie NICHT benutzt

Migrationen auf dem Server: in `~/fw/FW-Hub` nach `git pull`
`scripts/server-migrate.sh [--bis 0012]`. Bewusst kein `docker compose run`:
Compose könnte sonst im falschen Projekt einen zweiten Postgres auf dasselbe
Volume starten. Das Skript
- baut das Migrations-Image neu (Dockerfile-Stage `migrate`: migrate.mjs, SQL
  und Journal), sodass nach einem `git pull` keine Migration fehlt
- liest POSTGRES_USER und POSTGRES_PASSWORD zur Laufzeit aus dem Container
  `fw_postgres`. Es gibt keine Passwortdatei, und das Passwort steht nicht in
  der Befehlszeile, in der Shell-History oder in der Ausgabe
- startet einen kurzlebigen Container im Netz `fw-network`, kodiert die Zugangs-
  daten URL-konform und migriert `fw_postgres:5432/fwhub`
- reicht alle Argumente an scripts/migrate.mjs durch. Ohne Argument werden ALLE
  ausstehenden Migrationen in EINER Transaktion angewendet, `--bis 0012` endet
  nach dieser Nummer
- gibt VOR und NACH der Migration die Zahl der Migrationen und der Policies in
  core aus und endet mit dem Exit-Code der Migration
Erwartete Ausgabe: je ein Block `Migrationen: <Anzahl>` und `Policies in core:
<Anzahl>` unter "Stand VORHER" und "Stand NACHHER", dazwischen `Migrationen
eingetragen: <vorher> -> <nachher>`. Die Migrationsrolle
ist POSTGRES_USER des Containers und muss Eigentümerin der Tabellen sein
(aktuell `nocodb`, siehe "Offene Punkte").

App ausrollen: in `~/fw/fwhub-stack` `docker compose build portal && docker
compose up -d portal`. Nie `docker compose down -v` (das Postgres-Volume
setup_postgres_data ist external).

### Produktion: Client-IP, Tunnel und Login-Sperre
Ausführlich in `drizzle/manual/login-sperre.md`. Kurzfassung:

Aufbau (Stand 08.11.2026): Browser → Cloudflare → **Cloudflare Tunnel**
(`cloudflared` als Host-Dienst) → `http://127.0.0.1:8180` → nginx (`fw_nginx`)
→ `portal`. Die Client-IP kommt aus `CF-Connecting-IP`, nginx macht daraus
`$remote_addr` und `X-Real-IP`, die App liest nur `X-Real-IP` (Fallback: letzter
Eintrag von `X-Forwarded-For`).

- **Portbindung:** nginx 8180 ist auf `127.0.0.1` gebunden. **Er darf nicht
  wieder auf `0.0.0.0` gebunden werden.** Sonst kann jeder im LAN über die
  Gateway-Adresse `CF-Connecting-IP` fälschen und die IP-Sperre umgehen.
  8190 (Uptime-Kuma-Proxy, aus dem LAN genutzt) und 8192 (Homarr) sind davon
  unabhängig
- **Warum `set_real_ip_from 172.18.0.1`:** Eine Verbindung vom Host auf einen
  veröffentlichten Docker-Port sieht der Container mit der Gateway-Adresse des
  Docker-Netzes als Absender. Ohne die Zeile ignoriert nginx `CF-Connecting-IP`
  und alle Nutzer hätten dieselbe interne Adresse. Vertretbar ist das nur wegen
  der Loopback-Bindung. Bei Änderungen am Docker-Netz die Gateway-Adresse neu
  prüfen (`docker network inspect <netz>`)
- **Die Cloudflare-Netze** in `nginx.conf` (IPv4 und IPv6) sind nur für den
  direkten Proxy-Betrieb relevant, im Tunnel-Betrieb unwirksam
- **Server-Dateien nicht im Repo:** `feuerwehr-portal/docker-compose.yml` und die
  dortige nginx-Konfiguration wurden auf dem Server lokal angepasst. `nginx.conf`
  und `docker-compose.yml` im Repo sind die Referenz und werden von Hand
  abgeglichen
- **Login-Sperre:** 5 Fehlversuche je Name+IP, 50 je Name (alle IPs), 30 je IP,
  jeweils 15 Minuten. IPv6 wird pro /64 gezählt. Private, Loopback-, Docker- und
  ungültige Adressen gelten als "unbekannt" (Warnung im Log, keine IP-Sperre).
  Eine Logzeile `Login-Sperre: Client-IP … nicht öffentlich` bedeutet: Die
  Proxy-Kette ist kaputt
- **Prüfen:** `SELECT ip, count(*) FROM core.login_attempts GROUP BY ip ORDER BY
  2 DESC LIMIT 10;` zeigt echte öffentliche Adressen, wenn die Kette stimmt
- **Tests:** `node scripts/test-client-ip.mjs` (ohne Server),
  `node scripts/test-login-sperre.mjs` und `node scripts/test-login-deaktiviert.mjs`
  (mit lokalem Dev-Server)

### Produktion: Backup
`scripts/server-backup.sh` sichert die Datenbank `fwhub` aus dem Container
`fw_postgres` (`pg_dump -Fc`) nach `/root/backups/fwhub/` und läuft täglich per
Cron als root.

Was das Skript tut
- Schreibt `fwhub_JJJJ-MM-TT_HHMM.dump` mit Rechten 600 (Verzeichnis 700). Erst
  entsteht eine `.tmp`-Datei, die nach der Prüfung umbenannt wird
- Prüft, dass die Datei größer als 0 Byte ist und `pg_restore --list` sie lesen
  kann. Sonst Exit 1, eine `FEHLER`-Zeile im Log und kein Dump
- Aufbewahrung: alle Dumps der letzten 14 Tage, davor je der neueste Dump pro
  Kalenderwoche für 8 Wochen, der Rest wird gelöscht. Es werden nur Dateien nach
  dem Namensmuster angefasst, andere Dateien nie (z. B. ein von Hand angelegter
  Dump mit eigenem Namen)
- Eine Zeile pro Lauf in `/root/backups/fwhub/backup.log` (`OK …`, `WARNUNG …`
  oder `FEHLER …`). Bei Fehlern zusätzlich Ausgabe auf stderr und Exit 1
- Optional eine Kopie in ein zweites Verzeichnis (Variable `FWHUB_BACKUP_KOPIE`,
  leer = keine Kopie). Dieselbe Aufbewahrung gilt dort. Schlägt die Kopie fehl,
  bleibt das lokale Backup erhalten, das Skript endet trotzdem mit Exit 1
- `scripts/server-backup.sh --nur-aufraeumen` wendet nur die Aufbewahrung an

Installation (einmalig, als root auf dem Server; Pfad anpassen, falls das Repo
nicht unter `/root/fw/FW-Hub` liegt)
1. Das Exec-Bit ist im Repo gesetzt. Falls nicht:
   `chmod +x /root/fw/FW-Hub/scripts/server-backup.sh`
2. Probelauf: `/root/fw/FW-Hub/scripts/server-backup.sh`. Erwartet: keine Ausgabe,
   Exit 0, eine `OK`-Zeile im Log und eine neue `.dump`-Datei
3. Rechte prüfen: `ls -l /root/backups/fwhub` zeigt `-rw-------` für den Dump,
   `ls -ld /root/backups/fwhub` zeigt `drwx------`
4. Cron, `crontab -e` als root, täglich um 03:15:
   ```
   15 3 * * * /root/fw/FW-Hub/scripts/server-backup.sh
   ```
   Mit Kopie, zum Beispiel auf einen NAS-Mount:
   ```
   15 3 * * * FWHUB_BACKUP_KOPIE=/mnt/nas/fwhub /root/fw/FW-Hub/scripts/server-backup.sh
   ```
   Das Zielverzeichnis muss existieren und beschreibbar sein (Mount prüfen)
5. Laufende Kontrolle: `tail -n 3 /root/backups/fwhub/backup.log` zeigt den
   letzten Lauf. Eine `FEHLER`- oder `WARNUNG`-Zeile braucht Aufmerksamkeit.
   Fehlt der Eintrag für einen Tag ganz, hat Cron das Skript nicht gestartet

Wiederherstellung testen (in eine Test-Datenbank, nie über die laufende fwhub).
Mindestens einmal nach der Einrichtung, danach z. B. quartalsweise:
```
U=$(docker exec fw_postgres printenv POSTGRES_USER)
docker exec fw_postgres createdb -U "$U" fwhub_restore_test
docker exec -i fw_postgres pg_restore -U "$U" -d fwhub_restore_test --exit-on-error \
  < /root/backups/fwhub/fwhub_<JJJJ-MM-TT_HHMM>.dump
docker exec fw_postgres psql -U "$U" -d fwhub_restore_test -At \
  -c "select count(*) from drizzle.__drizzle_migrations" \
  -c "select count(*) from core.kameraden" \
  -c "select count(*) from core.benutzer"
```
Die Zahlen mit derselben Abfrage gegen `-d fwhub` vergleichen (sie weichen nur
um Änderungen seit dem Backup ab). Danach aufräumen:
`docker exec fw_postgres dropdb -U "$U" fwhub_restore_test`.
Lokal ist genau diese Abfolge mit einem Dump der Entwicklungsdatenbank getestet
(Benutzer, Kameraden, Migrationen, Policies und Trigger stimmten überein).
Für eine echte Wiederherstellung dieselbe Abfolge in eine neue, leere
Datenbank, die App vorher stoppen. Die Rollen (`fw_app`, `fw_auth`, der
Migrationsbenutzer) stehen nicht im Dump: Auf einem neuen Server vorher
drizzle/manual/create-fw-app-role.sql ausführen.

**Ein Backup nur auf demselben Server ist kein echtes Backup.** Festplatten-
ausfall, Diebstahl, Brand, Verschlüsselungstrojaner oder ein Fehler am Volume
treffen Datenbank und Dumps gleichzeitig. Darum eine Kopie auf ein anderes Gerät
an einem anderen Ort einrichten (`FWHUB_BACKUP_KOPIE`, z. B. NAS oder anderer
Rechner; ein Gerät im selben Raum schützt nicht vor Brand) und gelegentlich
prüfen, dass dort tatsächlich aktuelle Dateien liegen. Die Dumps enthalten
personenbezogene Daten und PIN-Hashes. Kopien nur auf Ziele mit
eingeschränktem Zugriff legen, am besten verschlüsselt.

### Ausrollen Härtung core.kameraden/benutzer (Migrationen 0012/0013)
Ergebnis vom 08.11.2026: 0012 und 0013 ausgerollt (14 Migrationen, 10 Policies
in core), Spaltenrechte geprüft. Weitere Smoke-Tests sind hier nicht
protokolliert. Der Ablauf bleibt als Vorlage für ähnliche Umbauten.

Was man wissen muss
- 0012 ist additiv (alte App läuft weiter), 0013 entzieht Rechte (alte App
  bricht). Reihenfolge deshalb: 0012, dann App, dann 0013, also
  `--bis 0012` und danach derselbe Aufruf ohne Argument
- 0012 setzt ENABLE und FORCE ROW LEVEL SECURITY auf core.kameraden und
  core.benutzer selbst (idempotent). Ohne RLS wären die Policies wirkungslos
  für Zeilen. Auf Produktion war es schon aktiv

Schritte
1. **Vorbereitung**: Lokal tsc, Build, `node scripts/test-haertung.mjs` und
   `node scripts/test-login-deaktiviert.mjs` (Dev-Server nötig) grün. Auf dem Server `git pull` in `~/fw/FW-Hub`. Test-Konten
   für den Smoke-Test festlegen: ein Testkamerad mit Benutzer, klar benannt
   (z. B. "Test-Rollout"). Kameraden werden nie gelöscht, der Testkamerad
   bleibt danach inaktiv
2. **Wartungsfenster** ankündigen (30 Minuten reichen): Kiosk-Anmeldung /food
   und PSA-Pflege kurz nicht nutzen. Die Migration dauert Sekunden, der
   App-Neustart unter einer Minute
3. **Backup** und Stand erfassen
   - `/root/fw/FW-Hub/scripts/server-backup.sh` als root (siehe "Produktion:
     Backup"). Es prüft den Dump selbst. Das Skript endet mit Exit 0 und die
     neue Datei steht in `/root/backups/fwhub/`
   - Eine Kopie außerhalb des Servers ablegen
   - Als Owner im psql (`docker exec -it fw_postgres psql -U nocodb -d fwhub`)
     den Stand erfassen, Sollwerte vor dem Start:
     ```sql
     select count(*) from drizzle.__drizzle_migrations;            -- 12
     select count(*) from pg_policies where schemaname = 'core';   -- 5
     select relname, relrowsecurity, relforcerowsecurity
       from pg_class
      where oid in ('core.kameraden'::regclass, 'core.benutzer'::regclass); -- beide t/t
     select count(*) from core.benutzer where rolle = 'Admin' and aktiv;   -- mindestens 1
     select distinct tableowner from pg_tables where schemaname = 'core';  -- = Migrationsrolle
     ```
4. **Migrationsrolle prüfen**: POSTGRES_USER von `fw_postgres` (die Rolle, mit
   der das Skript migriert) muss genau die sein, die die letzte Abfrage nennt,
   sonst fehlen ihr Rechte an den Tabellen. Die frühere Pflicht, den Eigentümer von set_karten_id auf eine
   Rolle mit RLS-Bypass zu stellen, entfällt ab 0012 (die Funktion arbeitet
   jetzt ohne Bypass)
5. **Migration 0012**: `scripts/server-migrate.sh --bis 0012`, erwartet
   `12 -> 13` und `Policies in core: 12` (alte und neue Policies). Prüfen:
   `relrowsecurity` und `relforcerowsecurity` sind für kameraden und benutzer
   `t`, Trigger `kameraden_deaktiviert_benutzer` auf
   core.kameraden vorhanden, Funktionen eigene_pin_setzen,
   eigene_sitzungen_beenden, kamerad_deaktiviert, set_kamerad_rollen und
   set_karten_id in core. Die alte App läuft weiter: Login und /psa öffnen
6. **App ausrollen** (Befehle oben, nie mit `-v`). Prüfen: /api/health ist ok,
   der Start-Schutz meldet im Log keinen Fehler. Kurzer Smoke gegen den
   additiven Stand: Login, /admin/benutzer, /psa
7. **Migration 0013**: `scripts/server-migrate.sh`, erwartet `13 -> 14` und
   `Policies in core: 10`. Prüfen: kameraden_scope und benutzer_scope sind weg.
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
   | Login mit deaktiviertem Test-Konto | Richtige PIN: 403 "Dein Konto ist deaktiviert. Bitte wende dich an die Wehrführung." Falsche PIN: 401 "Benutzername oder PIN falsch" |
   | PIN ändern (Test-User unter /profil) | Erfolg. Eine zweite offene Sitzung dieses Benutzers landet nach Reload auf /login. Login mit neuer PIN klappt |
   | Kamerad deaktivieren (Kleiderwart in /psa, Testkamerad mit Konto) | Kamerad inaktiv, Konto in /admin/benutzer inaktiv, Login des Kontos scheitert. Den eigenen Kameraden deaktivieren → 409 mit Meldung |
   | Karten-ID setzen (Küche-Verwaltung, Testkamerad) | Gespeichert. Dieselbe ID bei einem anderen Kameraden → 409. Im PSA-Formular ist das Feld schreibgeschützt. Anmeldung mit der Testkarte am Kiosk /food klappt |
   | Rollen ändern (Admin in /admin/benutzer, Testkamerad) | Rolle setzen und entfernen klappt. Das Konto des Testkameraden muss sich neu anmelden. Ein Kleiderwart kann keine Rollen ändern |
   | Kamerad anlegen (damals Kleiderwart in /psa; seit 0015 nur globaler Admin in /mitglieder) | Stammdaten werden gespeichert |
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

### Ausrollen Migration 0015 (Kameraden schreiben nur globale Admins)
Befehle gegen den Server führt der Mensch aus. 0015 ist restriktiv: Die ALTE App
(vor Paket 4/5) kann danach keine Kameraden mehr als Kleiderwart anlegen oder
ändern. Reihenfolge deshalb **App, dann 0015**. 0015 ersetzt nur zwei Policies
(Anzahl Policies in core bleibt gleich) und braucht keine Rollenänderung.

Vorbereitung (lokal, vorher grün): `npx tsc --noEmit`, `npm run build`,
`node scripts/test-haertung.mjs` (106 Prüfungen), `node scripts/test-mitglieder-rechte.mjs`,
`node scripts/test-mitglieder-lib.mjs`, mit Dev-Server `node scripts/test-mitglieder.mjs`.
Rechtetest zusätzlich gegen einen Klon, dessen Owner weder Superuser noch
BYPASSRLS hat (`TEST_DB=<klon> node scripts/test-haertung.mjs`).

Schritte
1. **Backup**: `/root/fw/FW-Hub/scripts/server-backup.sh` als root. Exit 0, neue
   `.dump`-Datei in `/root/backups/fwhub/`, Kopie außerhalb des Servers
2. **Code holen**: in `~/fw/FW-Hub` `git pull`
3. **Stand erfassen** (als Owner im psql, `docker exec -it fw_postgres psql -U nocodb -d fwhub`):
   ```sql
   select count(*) from drizzle.__drizzle_migrations;            -- 15
   select count(*) from pg_policies where schemaname = 'core';   -- 12
   select policyname, with_check from pg_policies
    where schemaname = 'core' and policyname = 'kameraden_anlegen'; -- enthält psa_rolle
   ```
4. **App ausrollen** in `~/fw/fwhub-stack`:
   `docker compose build portal && docker compose up -d portal` (nie mit `-v`).
   Prüfen: `/api/health` ok, Start-Schutz ohne Fehler im Log. Kurzer Smoke gegen
   die noch alte Policy: Login, `/mitglieder`, `/psa`
5. **Migration 0015**: in `~/fw/FW-Hub` `scripts/server-migrate.sh`. Erwartet
   `Migrationen eingetragen: 15 -> 16` und `Policies in core: 12` vorher wie nachher
6. **Policies prüfen** (als Owner):
   ```sql
   select policyname, coalesce(qual,'') || ' ' || coalesce(with_check,'')
     from pg_policies
    where schemaname = 'core' and policyname in ('kameraden_anlegen','kameraden_aendern');
   -- nur noch app_rolle = 'Admin', kein psa_rolle
   ```
7. **Smoke-Test** mit Test-Konten, nicht mit echten Mitgliedern:
   | Test | Erwartung |
   |---|---|
   | Globaler Admin: Kamerad in /mitglieder anlegen, Stammdaten ändern, deaktivieren | klappt, Änderungsverlauf zeigt den Eintrag |
   | Kleiderwart: /psa öffnen | Größenübersicht und Ausrüstung laden, kein Kameradenformular |
   | Kleiderwart: Größen eines Kameraden ändern (/mitglieder/[id] → PSA) | gespeichert |
   | Kleiderwart: `/mitglieder/[id]` Stammdaten | nur lesend, kein Speichern |
   | Küchen-Admin: Karten-ID setzen (Abschnitt Küche) | gespeichert (läuft über set_karten_id, unabhängig von 0015) |
   | Funk-Gerätewart: /funk, Gerätezuteilung | Kameradenliste erscheint |
   | Jede Rolle: /profil | "Meine Daten" nur lesend |
8. **Abschluss**: Backup-Datei bis zum nächsten Tag aufbewahren, Uptime Kuma grün

Rückweg
- 0015 schlägt fehl: Es ist eine Transaktion, nichts wurde angewendet
- Probleme nach 0015: Rücknahme-SQL aus dem Kopf von
  drizzle/0015_kameraden_nur_admin_schreibt.sql als Owner ausführen (stellt die
  Policies mit psa_rolle wieder her; der Eintrag für 0015 bleibt in
  drizzle.__drizzle_migrations). Die neue App braucht diesen Rückweg nicht,
  sie schreibt Kameraden nur als globaler Admin
- Probleme in der App: vorheriges Image starten. Vor 0015 ist das ungefährlich;
  nach 0015 kann die alte App Kameraden nicht als Kleiderwart schreiben, dann
  zusätzlich das Rücknahme-SQL ausführen

### Tests (scripts/)
Alle Skripte, die Daten schreiben oder löschen, rufen `schutz()` aus
scripts/lib/schutz.mjs auf: Jede benutzte Verbindungs-URL (DATABASE_URL,
AUTH_DATABASE_URL, MIGRATE_DATABASE_URL, TEST_BASE) muss gesetzt und lokal sein,
sonst Exit 2 vor dem ersten Verbindungsaufbau (nur Namen in der Meldung, nie
Werte). Neue Testskripte binden den Helfer ein. Skripte, die selbst einen Server
starten, nutzen scripts/lib/prozess.mjs (beendet den ganzen Prozessbaum, unter
Windows mit taskkill, sonst über die Prozessgruppe). Sie legen Testdaten mit Zeitstempel-Präfix an und räumen nur
über gemerkte IDs auf. "Dev-Server" heißt `npx next dev --webpack -p 3100`.
| Skript | Prüft | Dev-Server |
|---|---|---|
| test-haertung.mjs | RLS, Spaltenrechte, Funktionen, Trigger, Änderungsprotokoll auf core.kameraden/benutzer; mit `TEST_DB=<klon>` gegen einen Klon mit Owner ohne BYPASSRLS | nein |
| test-psa.mjs | RLS aller PSA-Tabellen je Rolle (DB) und PSA-API (Kreislauf, User-Schreibwege 403, Löschregeln, Changelog) | Teil 2 |
| test-sitzungen.mjs | JWT-Claims, /api/admin/*, Token-Widerruf, PIN, Abmelden, Selbstschutz, Logout, Startseite/Kacheln, ungültige JWTs | ja |
| test-food.mjs | Karten-ID-Route, set_karten_id, CSV-Import/-Export, Funk-Scope, /food/admin/heute | ja |
| test-mitglieder.mjs, -rechte.mjs, -lib.mjs | Mitgliederverwaltung (API, Seiten, Profil), Rechteregeln, Validierung | ja / nein / nein |
| test-mitglieder-import-lib.mjs, test-mitglieder-import.mjs | CSV-Import von Kameraden: Kodierung, Tabelle und Anwesenheitsliste, Abgleich (ohne Server); Route mit Rechten, Vorschau, Übernahme, veralteter Auswahl, Protokoll | nein / ja |
| test-anzeigename.mjs | Anzeigename-Regel (Spitzname, Nachname, Vornamen-Präfix, identische Namen, externe Personen) | nein |
| test-login-sperre.mjs, test-login-deaktiviert.mjs, test-client-ip.mjs | Login-Sperre, deaktivierte Konten, Client-IP | ja / ja / nein |
| test-ui-a.mjs | Seitenrahmen, Kopfzeile, Umschalter, Seiten außerhalb des Rahmens | ja |
| test-migr-bis.mjs | Staffelung 0011 bis 0015 in einer Wegwerf-Datenbank (legt fwhub_migr_test an und löscht sie) | nein |
| test-dienstplan-rls.mjs | RLS aller Tabellen in dienstplan je Rolle und Organisation, Trigger (Version, Freigabeschutz), kameraden_namen(), dienst_rolle in core, Anzeige-Scope (Token gültig, abgelaufen, unbekannt), vorjahr_themen() je Rolle, Versionen lesen (0021), ical_abos und abo_scope() (0022) | nein |
| test-dienstplan-auth.mjs | Alle Routen unter /api/dienstplan ohne Login → 401 (findet die Routen selbst; Token-Routen: 401/403), Claim dienst_rolle, Rollenvergabe | ja |
| test-dienstplan-kalender.mjs, test-dienstplan-eingabe.mjs | Rhythmus, Feiertage Niedersachsen, Akzeptanztest 2026 (Regeln aus der DB, nur lesend); Eingabeprüfung und Hinweise der API | nein / nein |
| test-dienstplan-verwaltung.mjs | Neues Jahr mit Vorschau und Zwischendienst-Versatz (Regel wird aufgeteilt, danach wiederhergestellt), Kategorien, Rhythmusregeln, Bereiche je Rolle, Dienstplan-Seiten je Rolle | ja |
| test-dienstplan-api.mjs | Dienstplan-API: Pläne, Generator (idempotent), Termine, Themen am Termin, Verantwortliche, Kataloge, Rechte je Rolle, ETag/304, Hinweise | ja |
| test-dienstplan-anzeige.mjs | Präsentation: Anzeige-Links (12 h, nur Hash gespeichert), Token-Route ohne/falsch/abgelaufen 401, anderer Plan 403, ohne Notizen, Fokus und ETag/304, Beenden | ja |
| test-dienstplan-rueckgaengig.mjs | Phase 7: Termin-Zustand (Rückgängig, 409 bei fremder Änderung), Kopie einer Themenposition, Verschieben an Position, Datum ändern, Vorjahr in Plan- und Token-Route je Status | ja |
| test-dienstplan-pool.mjs | Phase 8: Themenpool (Sichtbarkeit je Rolle, verwerfen, übernehmen mit/ohne Termin, gleicher Titel), Ausgleichsliste und Zählung je Plan mit Vorjahr, Pflichtthemen-Vorschlag (Katalog wird wiederhergestellt), /dienstplan | ja |
| test-dienstplan-versionen-lib.mjs, test-dienstplan-versionen.mjs | Phase 9: Abbild, Vergleich, „geändert seit Freigabe“, Wiederherstellplan (ohne Server); Versionen-API: manuell, bei Freigabe, Liste, Ansehen, Vergleich, Markierung für Mitglieder, Wiederherstellen (sichert vorher, ids bleiben), Rechte | nein / ja |
| test-dienstplan-export-lib.mjs, test-dienstplan-export.mjs | Phase 10: Termindaten, Formate, CSV-Quoting, Kodierung, Profilprüfung, Änderungsexport, iCal (ohne Server); Exportprofile (Rechte), CSV DIVERA komplett/Änderungen mit Löschliste, .ics je Rolle, Excel (Blätter, Farben, Druck), iCal-Abo (Feed ohne Login, Zähler, widerrufen → 404) | nein / ja |
| test-dienstplan-druck-lib.mjs, test-dienstplan-druck.mjs | Phase 11: Druckzeilen, Legende, Bildmaße (ohne Server); PDF (Seiten, Schrift eingebettet) und Bild (PNG 1290 × 2796) je Rolle, Parameter, Cache. Auch gegen den Standalone-Build laufen lassen (`TEST_BASE`), weil das Datei-Tracing nur dort greift | nein / ja |
| test-dienstplan-import-lib.mjs, test-dienstplan-import.mjs | Excel-Import Dienstplan: Analyse-Regeln (ohne DB) bzw. Ende zu Ende als fw_app mit erzeugter Excel (Jahre 2091/2092), Localhost-Sperre von `--testdaten` | nein / nein |
| test-setup.mjs | Erst-Einrichtung /setup in einer Wegwerf-Kopie von fwhub_dev mit leerem core.benutzer (eigener Dev-Server auf 3101; den Dev-Server auf 3100 vorher beenden) | eigener |
| test-startschutz.mjs | Datenbank-Startschutz: `next start` bricht bei fehlender/falscher Rolle ab, `next dev` warnt nur, keine URLs oder Passwörter in der Ausgabe (Ports 3102/3103, braucht `npm run build`, Dev-Server auf 3100 vorher beenden) | eigener |
`scripts/dienstplan-import.mjs` ist kein Testskript, sondern das Werkzeug für den
einmaligen Excel-Import (auch gegen Produktion) und ruft darum `schutz()` nicht auf.
Nur sein Modus `--testdaten` (legt Kameraden an) bricht ohne lokale DATABASE_URL ab.
Auf dem Server läuft es über `scripts/server-import.sh` (Dockerfile-Stage `import`,
Excel und zuordnung.json nur read-only gemountet; `data/` steht in .dockerignore).
Ablauf und Klärung: docs/dienstplan/PROGRESS.md, Phase 4 und Deployment-Checkliste.
Der Letzte-Admin-Schutz ist auf Datenbankebene in test-haertung (1e/1f) geprüft.
Über die API ist er seit 0015 nicht mehr erreichbar: Kameraden deaktivieren darf nur
ein globaler Admin, und der Selbstschutz greift davor (test-sitzungen).

### Offene Punkte (Datenbank)
- **Eigene Owner-Rolle `fw_owner` statt Superuser `nocodb`** (nicht umgesetzt).
  Aktuell gehören die core-Tabellen und -Funktionen der Rolle `nocodb`
  (Superuser, BYPASSRLS), und die Migrationen laufen vermutlich als `nocodb`.
  Dadurch läuft jede SECURITY-DEFINER-Funktion mit Superuser-Rechten, und
  fehlende Rechte oder Policies fallen nicht auf, weil ein Superuser RLS und
  Spaltenrechte umgeht. Ziel: Rolle `fw_owner` (kein Superuser, kein
  BYPASSRLS) wird Eigentümerin der core-Tabellen und -Funktionen und führt die
  Migrationen aus. Die Funktionen aus 0012 sind schon gegen einen Eigentümer
  ohne BYPASSRLS getestet, sie müssen nicht geändert werden. Zu erledigen sind
  Rolle anlegen, Eigentum und Schema-Rechte übertragen (auch psa, fw_funk,
  fw_food), scripts/server-migrate.sh auf die neue Rolle umstellen (liest bisher
  POSTGRES_USER aus fw_postgres), create-fw-app-role.sql und diese
  Anleitung nachziehen und mit test-haertung gegen einen Klon mit dieser Rolle
  prüfen

## Oberfläche
- Farben nur über Theme-Tokens aus src/app/globals.css (bg-background,
  bg-card, text-foreground, text-muted-foreground, border-border, bg-primary,
  bg-destructive, bg-success, border-warning usw.). Keine festen Farbklassen
  (bg-white, text-gray-*, bg-green-600 …) und keine Hex-Werte in Komponenten.
  Einzige Ausnahme: die QR-Code-Ruhezone (bg-white, sonst nicht scanbar)
- Dienstplan-Kategoriefarben: Tokens `--dp-<farbe>` (Spec 7.1), nur als Akzentstreifen
  und 12-%-Tönung; Klassen nur über die Tabelle in components/dienstplan/farben.ts
  (Tailwind erzeugt nur wörtlich vorkommende Klassen). Text darauf bleibt foreground
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
| Dienstplan | /dienstplan | Neu, siehe docs/dienstplan/DIENSTPLAN_SPEC.md | In Arbeit auf feature/dienstplan, Stand in docs/dienstplan/PROGRESS.md. Für Nutzer erst nach Release 1 sichtbar |
| Funktechnik | /funk | Neu, siehe FUNK_APP_SPEC.md | Datenmodell spezifiziert, Implementierung ausstehend. Referenz für Auth-Pattern: Funk-App/lib/funk-auth.ts (dort korrekt gegen Kameraden.id gebaut) — Funk-App selbst NICHT weiterverwenden, nur als Vorlage lesen |

## Mitgliederverwaltung (/mitglieder)
Zentrale Verwaltung aller Personendaten. Module zeigen Personen nur an und
verlinken auf /mitglieder/[id] (`MitgliedLink`, Ziel aus `mitgliedLinkZiel`).
- **Seiten:** `/mitglieder` (Liste mit Suche, Filter aktiv/inaktiv/ohne Login,
  ⋯-Menü je Zeile), `/mitglieder/[id]` (Abschnitte). `/admin/benutzer` leitet
  auf `/mitglieder` weiter. API: `/api/mitglieder` und `/api/mitglieder/[id]`
  (Stammdaten), Zugang und Rollen weiter über `/api/admin/benutzer*` und
  `/api/admin/rollen/*`
- **Rechte:** Sehen darf jede Verwaltungsrolle (globaler Admin, PSA
  Admin/Kleiderwart, Küchen-Admin, Funk Admin/Gerätewart) und jede Person sich
  selbst. Ändern (Stammdaten, Kameraden anlegen und deaktivieren, Zugang,
  Rollen) nur der globale Admin. Die Regeln stehen in
  `src/lib/mitglieder/rechte.ts`. Die Oberfläche zeigt nur an, durchgesetzt
  wird in der Datenbank (RLS, Spaltenrechte, Funktionen). Welche Felder eine
  Rolle bekommt, bestimmt die Projektion in `lib/mitglieder/lesen.ts`, denn
  Lesen lässt sich in der Datenbank nicht pro Spalte trennen
- **Abschnitte über eine Registry:** `src/lib/mitglieder/registry.ts` ist die
  einzige Stelle, an der Abschnitte bekannt sind. Jeder Abschnitt
  (`MitgliedAbschnitt`) bringt Titel, Reihenfolge, `rechte(user, id)` und eine
  Server-Komponente mit. Ein neues Modul legt eine Datei an und trägt eine Zeile
  in die Registry ein. Reihenfolge: Bereiche 10/20/30, Module ab 100, Verlauf 900
- **Modul-Abschnitte:** PSA (Größen bearbeiten über `/api/psa/groessen/[id]`,
  ausgegebene Ausrüstung lesen; PSA Admin/Kleiderwart), Küche (Karten-ID mit
  Scan-Eingabefeld über `set_karten_id`, QR-Link zur mobilen Anmeldung;
  Küchen-Admin), Funk (zugeteilte Geräte, nur lesend; Funk Admin/Gerätewart).
  Dateien: `components/<modul>/mitglied-abschnitt.tsx`. Ein globaler Admin ohne
  Modulrolle sieht keine Modul-Abschnitte
- **Module zeigen Personen nur an (Paket 5):** PSA hat statt des Kameradenformulars
  eine schreibgeschützte Größenübersicht (`/psa#groessen`), die Küche-Verwaltung
  nur noch den CSV-Import der Karten-IDs (keine Personenliste, keinen QR-Link je
  Person, keine Route `GET /api/food/admin/users`). Namen in Ausrüstungstabelle,
  Funk-Geräteliste und "Heutige Anmeldungen" verlinken auf `/mitglieder/[id]`
  (`MitgliedLink`, bei Kürzung mit `title`). Auswahllisten (Ausgabe, Zuteilung)
  bleiben. Die früheren Schreibrouten `POST/PATCH/DELETE /api/psa/kameraden` sind
  entfernt (405); `GET` bleibt für Auswahllisten. Kameraden anlegen, ändern und
  deaktivieren geht nur über `/api/mitglieder*` als globaler Admin, in der
  Datenbank durchgesetzt durch Migration 0015
- **Profil ("Meine Daten", Paket 6):** `/profil` zeigt jede Person ihre eigenen
  Abschnitte, nur lesend. Abschnitte mit `profil: true` in der Registry
  (Stammdaten, PSA, Funk) erscheinen dort; Zugang, Rollen, Küche und Verlauf nicht.
  PSA-Abschnitt sieht, wer PSA-Verwaltung ist oder bei sich selbst eine psa_rolle
  hat (`kannPsaAbschnittSehen`), Funk entsprechend (`kannFunkAbschnittSehen`)
- **Vorbereitung eigene Größen (nicht umgesetzt):** User sollen später ihre
  Größen selbst pflegen. Dafür kein direktes Schreibrecht auf
  psa.kamerad_details (User schreiben in PSA-Tabellen nie), sondern eine
  SECURITY-DEFINER-Funktion `psa.eigene_groessen_setzen` nach dem Muster von
  `core.eigene_pin_setzen` (nur die Zeile mit kamerad_id = app.kamerad_id, nur
  die Größenspalten). Der Profil-Abschnitt ist darauf vorbereitet
  (`bearbeiten` wird durchgereicht, `kannPsaAbschnittBearbeiten` bleibt
  PSA-Verwaltung)
- **CSV-Import (nur globaler Admin):** `/mitglieder` → „CSV importieren“,
  `POST /api/mitglieder/import` (Logik in `lib/mitglieder/csv-import.ts`). Tabelle
  `Nachname;Vorname;Spitzname;Personalnummer` oder Anwesenheitsliste des Kreises
  (Windows-1252). Vorschau, dann Übernahme der gewählten Zeilen in einer
  Transaktion (Server rechnet die Vorschau neu). Legt nur an oder füllt leere
  Personalnummern/Spitznamen; überschreibt und deaktiviert nie
- **Änderungsprotokoll:** Abschnitt "Änderungsverlauf" (nur globale Admins) aus
  `core.mitglieder_audit`
- **Anzeigename (Migration 0016):** `src/lib/mitglieder/anzeigename.ts` erzeugt
  den kurzen Namen für enge Darstellungen (Dienstplan, Exporte), modulübergreifend.
  Regel: Spitzname, wenn `spitzname_anzeigen`; sonst Nachname, wenn unter den
  aktiven Kameraden eindeutig; sonst "Nachname, " plus kürzestes eindeutiges
  Vornamen-Präfix ("Esters, Mar."). Gleicher Vor- und Nachname ist nicht
  unterscheidbar: Der Stammdaten-Abschnitt zeigt dann den Hinweis, einen
  Spitznamen zu vergeben. Spitzname und Haken pflegt der globale Admin in den
  Stammdaten. Der Name wird immer gegen ALLE aktiven Kameraden berechnet; wer nur
  die eigene Zeile sieht (Profil), bekommt ihn nicht angezeigt
- **Tests:** `scripts/test-mitglieder-rechte.mjs` und `test-mitglieder-lib.mjs`
  (ohne Server), `scripts/test-mitglieder.mjs` (API und Seiten, mit Dev-Server)

## Grundregel für ALLE Agents: Erst verifizieren, dann berichten
Nach JEDER Datei-Operation (Schreiben, Kopieren, Umbenennen, Löschen) den
tatsächlichen Zustand unabhängig gegenprüfen (Datei erneut lesen, Ordner
auflisten), BEVOR ein Erfolg gemeldet wird. Ein Tool-Rückgabewert allein
ist kein Beleg — insbesondere bei Netzlaufwerk-/UNC-Pfaden können Schreib-
operationen am falschen Ziel ankommen, ohne dass ein Fehler auftritt. Im
Zweifel: Pfad explizit nennen und den Nutzer bitten, selbst mit dir/ls
oder git status gegenzuprüfen, statt einen ungeprüften Erfolg zu melden.
