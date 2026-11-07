// Schutz gegen stilles Weiterarbeiten unter RLS: Ein UPDATE, das wegen einer
// Policy (oder einer unbekannten id) keine Zeile trifft, liefert keinen Fehler,
// sondern nur 0 Zeilen. Schreibende Transaktionen prüfen das mit expectRows
// und brechen per Exception ab (→ Rollback der gesamten Transaktion).
export class NoRowsAffectedError extends Error {
  constructor(readonly what: string) {
    super(`${what}: keine Zeile betroffen (nicht vorhanden oder nicht berechtigt)`);
    this.name = "NoRowsAffectedError";
  }
}

export function expectRows<T>(rows: T[], what: string): T[] {
  if (rows.length === 0) throw new NoRowsAffectedError(what);
  return rows;
}
