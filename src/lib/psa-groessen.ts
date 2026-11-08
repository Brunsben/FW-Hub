// Größenfelder der PSA (psa.kamerad_details) und ihre Eingabeprüfung. Reine
// Funktionen ohne Abhängigkeiten (scripts/test-mitglieder-lib.mjs testet sie
// direkt). Geschrieben werden die Größen über /api/psa/groessen/[kameradId],
// angezeigt im PSA-Abschnitt der Mitgliederseite und in der Größenübersicht.

export const GROESSEN_FELDER = [
  { feld: "jackeGroesse", label: "Jacke" },
  { feld: "hoseGroesse", label: "Hose" },
  { feld: "stiefelGroesse", label: "Stiefel" },
  { feld: "handschuhGroesse", label: "Handschuh" },
  { feld: "hemdGroesse", label: "Hemd" },
  { feld: "poloshirtGroesse", label: "Poloshirt" },
  { feld: "fleeceGroesse", label: "Fleece" },
] as const;

export type GroessenFeld = (typeof GROESSEN_FELDER)[number]["feld"];
export type Groessen = Record<GroessenFeld, string | null>;

const MAX_LAENGE = 20;

/**
 * Prüft einen Body mit beliebigen der sieben Größenfelder. Leere Werte werden
 * zu null (Größe entfernt), Text wird gekürzt um Leerraum. Unbekannte Felder
 * werden ignoriert, mindestens ein bekanntes Feld ist Pflicht.
 */
export function pruefeGroessen(
  body: unknown,
): { ok: true; daten: Partial<Groessen> } | { ok: false; fehler: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, fehler: "Ungültiger Body" };
  }
  const roh = body as Record<string, unknown>;
  const daten: Partial<Groessen> = {};
  for (const { feld, label } of GROESSEN_FELDER) {
    if (!(feld in roh)) continue;
    const wert = roh[feld];
    if (wert === null || wert === "") {
      daten[feld] = null;
      continue;
    }
    if (typeof wert !== "string") {
      return { ok: false, fehler: `${label} muss ein Text sein` };
    }
    const text = wert.trim();
    if (text.length > MAX_LAENGE) {
      return { ok: false, fehler: `${label} ist zu lang (höchstens ${MAX_LAENGE} Zeichen)` };
    }
    daten[feld] = text === "" ? null : text;
  }
  if (Object.keys(daten).length === 0) {
    return { ok: false, fehler: "Keine Größenfelder übergeben" };
  }
  return { ok: true, daten };
}
