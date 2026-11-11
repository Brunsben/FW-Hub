import { NextResponse } from "next/server";
import { withDienstplanScope, type ScopedTx } from "@/lib/db/scoped";
import { NoRowsAffectedError } from "@/lib/db/rows";
import { pgErrorCode, PG_INSUFFICIENT_PRIVILEGE, PG_UNIQUE_VIOLATION } from "@/lib/db/pg-error";
import {
  istDienstAdmin, istDienstPlaner, requireDienstplanSession, type DienstplanSession, type DienstRolle,
} from "@/lib/dienstplan/auth";

// Gemeinsamer Rahmen für alle Routen unter /api/dienstplan (außer Token-Routen):
// 1. Session (401), 2. Mindestrolle (403, nur für eine klare Meldung; durchgesetzt
// wird in der Datenbank), 3. die Arbeit in EINER Transaktion im Dienstplan-Scope,
// 4. Fehler auf Statuscodes abbilden. Der Scope kommt immer aus der Session,
// nie aus Request-Daten.

export class DpFehler extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "DpFehler";
  }
}

export const fehler = (status: number, meldung: string) => NextResponse.json({ error: meldung }, { status });

const RANG: Record<DienstRolle, number> = { Mitglied: 0, Planer: 1, Admin: 2 };

export interface DpKontext {
  s: DienstplanSession;
  tx: ScopedTx;
}

export async function dienstplanRoute(
  mindestens: DienstRolle,
  arbeit: (k: DpKontext) => Promise<Response>,
): Promise<Response> {
  const s = await requireDienstplanSession();
  if (!s) return fehler(401, "Nicht angemeldet");
  if (RANG[s.rolle] < RANG[mindestens]) {
    return fehler(403, mindestens === "Admin" ? "Nur für den Dienstplan-Admin" : "Nur für Planer und Admin");
  }
  try {
    return await withDienstplanScope(
      { kameradId: s.kameradId, dienstRolle: s.rolle, organisationId: s.organisationId },
      (tx) => arbeit({ s, tx }),
    );
  } catch (e) {
    if (e instanceof DpFehler) return fehler(e.status, e.message);
    if (e instanceof NoRowsAffectedError) return fehler(404, `${e.what}: nicht gefunden oder nicht berechtigt`);
    const code = pgErrorCode(e);
    if (code === PG_INSUFFICIENT_PRIVILEGE) return fehler(403, "Nicht berechtigt");
    if (code === PG_UNIQUE_VIOLATION) return fehler(409, "Eintrag gibt es schon");
    if (code === "23503") return fehler(400, "Verweis auf einen Eintrag, den es nicht gibt");
    if (code === "23514") return fehler(400, "Ungültige Werte");
    throw e;
  }
}

export { istDienstAdmin, istDienstPlaner };

export async function leseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b: unknown = await req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* unten */
  }
  throw new DpFehler(400, "Ungültiger Body (JSON-Objekt erwartet)");
}

export function leseIdParam(wert: string): number {
  const id = Number(wert);
  if (!Number.isInteger(id) || id <= 0) throw new DpFehler(400, "Ungültige id");
  return id;
}

export function leseJahrParam(wert: string): number {
  const jahr = Number(wert);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) throw new DpFehler(400, "Ungültiges Jahr");
  return jahr;
}
