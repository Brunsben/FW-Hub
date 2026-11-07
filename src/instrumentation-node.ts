// Nur Node-Runtime (importiert aus instrumentation.ts). Datenbank-Startschutz:
// In Produktion beendet ein Fehler den Prozess (Exit 1) — die App startet nicht
// mit falsch konfigurierten Datenbankrollen. Entwicklung: nur Warnung (die
// Warnung gibt checkDatabaseRoles selbst aus).
import { checkDatabaseRoles } from "@/lib/db/startup-check";

try {
  await checkDatabaseRoles();
} catch (e) {
  console.error(
    `[FATAL] ${e instanceof Error ? e.message : "Datenbank-Startschutz fehlgeschlagen"}`,
  );
  console.error("[FATAL] Start abgebrochen.");
  process.exit(1);
}
