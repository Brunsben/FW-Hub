import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  kameraden,
  psaAusruestungstuecke,
  psaAusruestungstypen,
  psaChangelog,
} from "@/lib/db/schema";
import type { PsaSession } from "@/lib/psa-auth";

// Schreibt einen Changelog-Eintrag. Benutzer stammt aus der Session (sub).
// Fehler werden nur geloggt, nie an den Aufrufer weitergereicht — ein
// fehlgeschlagenes Audit-Log darf die eigentliche Mutation nicht kippen.
export async function logChange(
  session: PsaSession,
  tabelle: string,
  aktion: string,
  details: string | null,
): Promise<void> {
  try {
    await db.insert(psaChangelog).values({
      tabelle,
      aktion,
      details,
      benutzer: session.benutzername,
    });
  } catch (e) {
    console.warn("PSA-Changelog-Eintrag fehlgeschlagen:", e);
  }
}

// ── Detail-Resolver (für inhaltlich identische Changelog-Texte) ─────────────

export async function typNameById(typId: number | null): Promise<string> {
  if (typId == null) return "?";
  const [row] = await db
    .select({ bezeichnung: psaAusruestungstypen.bezeichnung })
    .from(psaAusruestungstypen)
    .where(eq(psaAusruestungstypen.id, typId))
    .limit(1);
  return row?.bezeichnung ?? "?";
}

export async function typNameByStueck(stueckId: number | null): Promise<string> {
  if (stueckId == null) return "?";
  const [row] = await db
    .select({ bezeichnung: psaAusruestungstypen.bezeichnung })
    .from(psaAusruestungstuecke)
    .leftJoin(
      psaAusruestungstypen,
      eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
    )
    .where(eq(psaAusruestungstuecke.id, stueckId))
    .limit(1);
  return row?.bezeichnung ?? "?";
}

export async function kameradName(kameradId: number | null): Promise<string> {
  if (kameradId == null) return "?";
  const [row] = await db
    .select({ vorname: kameraden.vorname, name: kameraden.name })
    .from(kameraden)
    .where(eq(kameraden.id, kameradId))
    .limit(1);
  return row ? `${row.vorname} ${row.name}` : "?";
}
