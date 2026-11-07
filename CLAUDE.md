# FW-Hub

Projektkontext und verbindliche Regeln: @.github/copilot-instructions.md

Zusätzliche Regeln für Claude Code:

- Nur lokal arbeiten (Docker-Container fwhub-postgres-dev). Nie Befehle gegen den Server oder dessen Datenbank.
- Die App läuft lokal als fw_app (NOBYPASSRLS). Tests als Postgres-Superuser sind für RLS wertlos.
- Migrationen: drizzle-kit generate lokal. Anwenden nur über ein migrate.mjs-Skript mit MIGRATE_DATABASE_URL (Owner-Rolle), nie mit fw_app. drizzle-kit migrate verschluckt hier Fehler.
- Dev-Server: npx next dev --webpack.
- Shell ist PowerShell: keine Bash-Heredocs, kein < für Eingabeumleitung.
- Nach jeder Dateioperation durch erneutes Lesen prüfen. Erfolg erst melden, wenn tsc, Build oder ein Test es belegt.
- Kein git commit/push ohne ausdrückliche Anweisung.
- Secrets nie in Ausgaben wiederholen.
- Oberfläche: nur Theme-Tokens, keine festen Farbklassen. Portalseiten gehören nach src/app/(portal)/ (die Kopfzeile kommt vom Layout), Kiosk /food und /food/m/[token] bleiben außerhalb. Details in copilot-instructions.md, Abschnitt "Oberfläche".
- withGlobalAdminScope (setzt app.psa_rolle/app.app_rolle = 'Admin') nur nach requireGlobalAdmin() (API-Routen) bzw. requireGlobalAdminPage() (Seiten) und im Erst-Setup verwenden. Nie mit einem nicht geprüften Benutzer aufrufen.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
