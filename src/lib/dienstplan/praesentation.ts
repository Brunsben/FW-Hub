// Reine Hilfsfunktionen der Präsentationsansicht (Spec 7.3). Ohne Imports,
// damit scripts/test-dienstplan-praesentation.mjs die Datei direkt lädt.

export type Ansicht = "h1" | "h2" | "jahr";

/** Monate (0–11) einer Ansicht. */
export function monateDerAnsicht(a: Ansicht): number[] {
  if (a === "h1") return [0, 1, 2, 3, 4, 5];
  if (a === "h2") return [6, 7, 8, 9, 10, 11];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
}

/**
 * Ansicht aus dem URL-Parameter, sonst das Halbjahr als Standard: im laufenden
 * Jahr das aktuelle Halbjahr, sonst das erste (Planung des Folgejahres).
 */
export function ansichtAus(param: string | null | undefined, jahr: number, heute: string): Ansicht {
  if (param === "h1" || param === "h2" || param === "jahr") return param;
  return Number(heute.slice(0, 4)) === jahr && Number(heute.slice(5, 7)) >= 7 ? "h2" : "h1";
}

/** Halbjahr eines Datums "JJJJ-MM-TT". */
export const halbjahrVon = (datum: string): Ansicht => (Number(datum.slice(5, 7)) <= 6 ? "h1" : "h2");

export type Stand = { id: number; aktualisiertAm: string };

/**
 * Termine, die seit dem letzten Stand neu sind oder sich geändert haben
 * (aktualisiert_am setzt der Trigger bei jeder Änderung an Termin, Thema oder
 * Verantwortlichem). Beim ersten Laden (vorher = null) wird nichts markiert.
 */
export function geaenderteTermine(vorher: Stand[] | null, nachher: Stand[]): number[] {
  if (!vorher) return [];
  const alt = new Map(vorher.map((t) => [t.id, t.aktualisiertAm]));
  return nachher.filter((t) => alt.get(t.id) !== t.aktualisiertAm).map((t) => t.id);
}
