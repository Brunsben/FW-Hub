import { sql } from "drizzle-orm";
import type { ScopedTx } from "@/lib/db/scoped";
import { ladeKategorien, ladeTermine, type DpPlan } from "@/lib/dienstplan/plan";
import { druckZeilen, type DruckKategorie, type DruckZeile } from "@/lib/dienstplan/druck";

// Daten für PDF und Bild (Phase 11): Termine je Halbjahr, Kategorien, Name der
// Organisation. Läuft im Dienstplan-Scope (Mitglieder: nur freigegebene Pläne).
export async function ladeDruckdaten(tx: ScopedTx, plan: Pick<DpPlan, "id" | "jahr">, organisationId: number): Promise<{
  h1: DruckZeile[]; h2: DruckZeile[]; kategorien: DruckKategorie[]; organisation: string;
}> {
  const [termine, kategorien, org] = await Promise.all([
    ladeTermine(tx, plan),
    ladeKategorien(tx, organisationId),
    tx.execute<{ name: string }>(sql`select name from dienstplan.organisationen where id = ${organisationId}`),
  ]);
  return {
    h1: druckZeilen(termine, kategorien, 1),
    h2: druckZeilen(termine, kategorien, 2),
    kategorien,
    organisation: org[0]?.name ?? "Feuerwehr",
  };
}

/** Datei als Antwort zum Anzeigen im Browser (inline), nie im Cache. */
export function dateiInline(bytes: Uint8Array, mime: string, dateiname: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": mime,
      "content-disposition": `inline; filename="${dateiname}"`,
      "cache-control": "private, no-store",
    },
  });
}
