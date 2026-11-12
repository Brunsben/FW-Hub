import { sql, type SQL } from "drizzle-orm";
import type { ScopedTx } from "@/lib/db/scoped";
import { DpFehler } from "@/lib/dienstplan/route";

// Kleine Prüfungen und Hilfen für die schreibenden Termin-Routen.

/** Kategorie gehört zur Organisation und ist aktiv. */
export async function pruefeKategorie(tx: ScopedTx, organisationId: number, kategorieId: number) {
  const [k] = await tx.execute<{ aktiv: boolean }>(sql`
    select aktiv from dienstplan.kategorien where id = ${kategorieId} and organisation_id = ${organisationId}`);
  if (!k) throw new DpFehler(400, "Kategorie nicht gefunden");
  if (!k.aktiv) throw new DpFehler(400, "Kategorie ist nicht aktiv");
}

/** SET-Liste aus geprüften Feldern (nur die vorhandenen), Spaltennamen fest im Code. */
export function setListe(felder: Record<string, unknown>, spalten: Record<string, string>): SQL {
  const teile = Object.entries(felder)
    .filter(([k, v]) => v !== undefined && k in spalten)
    .map(([k, v]) => sql`${sql.raw(spalten[k])} = ${v}`);
  if (!teile.length) throw new DpFehler(400, "Keine änderbaren Felder im Body");
  return sql.join(teile, sql`, `);
}
