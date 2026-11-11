// Ausgleichsanzeige (Spec 7.2) und Pflichtthemen-Vorschlag (Spec 7.6).
// Reine Funktionen ohne Imports (scripts/test-dienstplan-eingabe.mjs lädt die
// Datei direkt).

/** Kategorien, die beim Ausgleich nicht zählen: Kameradschaft und Gremien. */
export const AUSGLEICH_OHNE = ["K", "G", "O"];

export type AusgleichPosition = { kuerzel: string; ausgefallen: boolean; kameradIds: number[] };

/**
 * Einteilungen je Kamerad: Jede Themenposition mit der Person als
 * Verantwortlicher zählt einmal. Nicht gezählt: ausgefallene Termine,
 * Kategorien K, G, O, Platzhalter (keine kameradId).
 */
export function zaehleEinteilungen(positionen: AusgleichPosition[], kameradIds: number[]): Map<number, number> {
  const out = new Map(kameradIds.map((id) => [id, 0]));
  const ohne = new Set(AUSGLEICH_OHNE);
  for (const p of positionen) {
    if (p.ausgefallen || ohne.has(p.kuerzel.toUpperCase())) continue;
    for (const id of new Set(p.kameradIds)) if (out.has(id)) out.set(id, out.get(id)! + 1);
  }
  return out;
}

/** Positionen aus geladenen Terminen (DpTermin) für zaehleEinteilungen. */
export function positionenAus(termine: { kuerzel: string; ausgefallen: boolean; themen: { verantwortliche: { kameradId: number | null }[] }[] }[]): AusgleichPosition[] {
  return termine.flatMap((t) => t.themen.map((p) => ({
    kuerzel: t.kuerzel, ausgefallen: t.ausgefallen,
    kameradIds: p.verantwortliche.map((v) => v.kameradId).filter((x): x is number => x !== null),
  })));
}

export type AusgleichZeile = { kameradId: number; name: string; anzahl: number; abweichung: number; deutlichUnter: boolean; vorjahr: number | null };

/**
 * Tabelle für die Seitenleiste: Durchschnitt der Gruppe, Abweichung je Person.
 * "Deutlich unter dem Durchschnitt": mindestens 1 und mindestens 25 % darunter.
 * Sortierung: wenigste Einteilungen oben, dann Name.
 */
export function ausgleichTabelle(
  personen: { kameradId: number; name: string; vorjahr?: number | null }[],
  zaehlung: Map<number, number>,
): { durchschnitt: number; zeilen: AusgleichZeile[] } {
  if (!personen.length) return { durchschnitt: 0, zeilen: [] };
  const summe = personen.reduce((s, p) => s + (zaehlung.get(p.kameradId) ?? 0), 0);
  const durchschnitt = summe / personen.length;
  const zeilen = personen.map((p) => {
    const anzahl = zaehlung.get(p.kameradId) ?? 0;
    const abweichung = anzahl - durchschnitt;
    return { kameradId: p.kameradId, name: p.name, anzahl, abweichung, deutlichUnter: abweichung <= -1 && anzahl <= durchschnitt * 0.75, vorjahr: p.vorjahr ?? null };
  });
  zeilen.sort((a, b) => a.anzahl - b.anzahl || a.name.localeCompare(b.name, "de"));
  return { durchschnitt, zeilen };
}

/** "3 · Ø 4,2" */
export const ausgleichText = (anzahl: number, durchschnitt: number) =>
  `${anzahl} · Ø ${durchschnitt.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

// ── Pflichtthemen-Vorschlag (Spec 7.6, Seed) ─────────────────────────────────

export type PflichtVorschlag = { titel: string; aliase: string[]; zielgruppe: string | null };

export const PFLICHT_VORSCHLAG: PflichtVorschlag[] = [
  { titel: "Sicherheitsunterweisung", aliase: ["sicherheitsunterweisung", "sicherheitsbelehrung"], zielgruppe: null },
  { titel: "Erste Hilfe", aliase: ["erste hilfe"], zielgruppe: null },
  { titel: "Atemschutzunterweisung", aliase: ["atemschutzunterweisung", "at-unterweisung", "at unterweisung"], zielgruppe: "Atemschutzgeräteträger" },
];

const normTitel = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");

/**
 * Ordnet die Vorschläge dem Katalog zu: gleicher Titel oder bekannte
 * Schreibweise (genau, ohne Teilwörter; "AT Unterweisung / Pumpenkunde" ist
 * kein Treffer). Ohne Treffer wird das Thema neu angelegt.
 */
export function pflichtZuordnen(katalog: { id: number; titel: string }[]): { vorschlag: PflichtVorschlag; themaId: number | null }[] {
  return PFLICHT_VORSCHLAG.map((v) => {
    const t = katalog.find((k) => v.aliase.includes(normTitel(k.titel)));
    return { vorschlag: v, themaId: t?.id ?? null };
  });
}
