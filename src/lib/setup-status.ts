import { sql } from "drizzle-orm";
import { authDb } from "@/lib/db/auth-client";

// Gibt es schon mindestens einen Benutzer? Prüfung über authDb (fw_auth,
// BYPASSRLS, SELECT auf core.benutzer): unter RLS sähe fw_app ohne Scope
// 0 Zeilen und hielte das System fälschlich für leer. Gleiche Logik wie der
// Guard in /api/auth/setup.
export async function benutzerVorhanden(): Promise<boolean> {
  const rows = (await authDb.execute(
    sql`select exists (select 1 from core.benutzer) as vorhanden`,
  )) as unknown as { vorhanden: boolean }[];
  return Boolean(rows[0]?.vorhanden);
}
