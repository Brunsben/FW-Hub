import { sql } from "drizzle-orm";

// Startschutz für die Datenbankrollen. Läuft einmal beim Serverstart
// (src/instrumentation.ts) und ist damit der erste Datenbankzugriff.
//
//  * AUTH_DATABASE_URL muss gesetzt sein (sonst liefe der Login über die
//    Hauptverbindung, siehe Fallback in auth-client.ts).
//  * Hauptverbindung (DATABASE_URL, App-Rolle): weder Superuser noch BYPASSRLS,
//    sonst wäre RLS wirkungslos.
//  * Auth-Verbindung (AUTH_DATABASE_URL, fw_auth): BYPASSRLS erlaubt, aber
//    kein Superuser.
//
// Produktion (NODE_ENV=production): Fehler → Abbruch. Entwicklung: Warnung.
// Es werden keine Werte, Rollennamen oder URLs ausgegeben.
export async function checkDatabaseRoles(): Promise<void> {
  const prod = process.env.NODE_ENV === "production";
  const probleme: string[] = [];

  if (!process.env.DATABASE_URL) {
    probleme.push("DATABASE_URL ist nicht gesetzt.");
  }
  const authUrlGesetzt = Boolean(process.env.AUTH_DATABASE_URL);
  if (!authUrlGesetzt) {
    probleme.push(
      "AUTH_DATABASE_URL ist nicht gesetzt (Login würde über die Hauptverbindung laufen).",
    );
  }

  if (process.env.DATABASE_URL) {
    try {
      const { db } = await import("./index");
      const [row] = (await db.execute(
        sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
      )) as unknown as { rolsuper: boolean; rolbypassrls: boolean }[];
      if (!row) {
        probleme.push("Hauptverbindung: Rolle nicht ermittelbar.");
      } else if (row.rolsuper || row.rolbypassrls) {
        probleme.push(
          "Hauptverbindung (DATABASE_URL) läuft mit Superuser- oder BYPASSRLS-Rechten; RLS wäre wirkungslos.",
        );
      }
    } catch {
      probleme.push("Hauptverbindung (DATABASE_URL): Prüfung fehlgeschlagen.");
    }
  }

  if (authUrlGesetzt) {
    try {
      const { authDb } = await import("./auth-client");
      const [row] = (await authDb.execute(
        sql`select rolsuper from pg_roles where rolname = current_user`,
      )) as unknown as { rolsuper: boolean }[];
      if (!row) {
        probleme.push("Auth-Verbindung: Rolle nicht ermittelbar.");
      } else if (row.rolsuper) {
        probleme.push(
          "Auth-Verbindung (AUTH_DATABASE_URL) läuft als Superuser; erlaubt ist höchstens BYPASSRLS.",
        );
      }
    } catch {
      probleme.push("Auth-Verbindung (AUTH_DATABASE_URL): Prüfung fehlgeschlagen.");
    }
  }

  if (probleme.length === 0) return;

  const text = `Datenbank-Startschutz:\n  - ${probleme.join("\n  - ")}`;
  if (prod) {
    throw new Error(text);
  }
  console.warn(`[WARNUNG] ${text}\n  (Entwicklungsmodus: Start wird fortgesetzt.)`);
}
