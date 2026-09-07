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
- Gemeinsame Postgres-Instanz, ein Schema pro Modul (psa, food, fk, fw_funk)
- Schema pv_monitoring (PV-Anlagen-Daten) wird NICHT angefasst
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
| kamerad_id ist im JWT für JEDEN Account gesetzt, niemals null (auch nicht für Admin) | Schema NOT NULL + Erst-Setup legt bei Bedarf Kameraden-Datensatz mit an (Henne-Ei-Problem) + laufende Benutzer-Anlage | Aufzubauen im FW-Hub-Schema, siehe Modul-Tabelle |
| Jedes Modul referenziert Kameraden.id direkt, führt KEINE eigene Mitgliederliste | Schema-Design | Bekannter Stolperstein — Funk-App hatte versehentlich eine eigene users-Tabelle gebaut, wurde korrigiert. Bei jedem neuen Modul explizit prüfen |
| Pro-Modul-Rollen-Claim (z.B. funk_rolle) wird bei Login ausgestellt | Schema-Spalte + Login-Route | Pro Modul einzeln aufzubauen |
| exp-Claim ist bei JEDER Verifizierung Pflicht | requireExp: true an allen jwtVerify-Aufrufen | Aufzubauen |
| pv_monitoring-Schema unangetastet | Konvention, keine technische Sperre | Einzuhalten |

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