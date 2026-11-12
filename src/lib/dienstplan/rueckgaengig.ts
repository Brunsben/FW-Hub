// Rückgängig/Wiederholen der Eingabemaske (Spec 7.2, Phase 7). Reine Funktionen
// ohne Imports (scripts/test-dienstplan-eingabe.mjs lädt die Datei direkt).
//
// Prinzip: Vor jeder Aktion merkt sich die Maske den Zustand aller Termine,
// danach vergleicht sie mit dem neu geladenen Plan (aktualisiertAm). Ein
// Eintrag enthält für jeden betroffenen Termin den Zustand vorher und nachher.
// Rückgängig stellt "vorher" her, Wiederholen "nachher", jeweils über
// PUT /termine/[id]/zustand (geänderte Termine), DELETE (angelegte) oder
// POST + PUT (gelöschte; neue id, die Einträge werden umgeschrieben).

export type ZVerantwortlicher = { kameradId: number | null; externePersonId: number | null; platzhalter: "alle_gf" | "offen" | null };
export type ZThema = { themaId: number | null; titelFreitext: string | null; ausBlockId: number | null; verantwortliche: ZVerantwortlicher[] };
export type Zustand = {
  datum: string; uhrzeit: string | null; dauerMinuten: number | null; kategorieId: number; ausgefallen: boolean;
  ort: string | null; bemerkung: string | null; notizen: string | null; themen: ZThema[];
};

/** Minimal benötigte Form eines geladenen Termins (DpTermin erfüllt sie). */
export type TerminQuelle = {
  id: number; datum: string; uhrzeit: string | null; dauerMinuten: number | null; kategorieId: number; ausgefallen: boolean;
  ort: string | null; bemerkung: string | null; notizen: string | null; aktualisiertAm: string; quelle: string;
  themen: { themaId: number | null; titel: string; freitext: boolean; ausBlockId: number | null;
    verantwortliche: { kameradId: number | null; externePersonId: number | null; platzhalter: "alle_gf" | "offen" | null }[] }[];
};

export function zustandVon(t: TerminQuelle): Zustand {
  return {
    datum: t.datum, uhrzeit: t.uhrzeit, dauerMinuten: t.dauerMinuten, kategorieId: t.kategorieId, ausgefallen: t.ausgefallen,
    ort: t.ort, bemerkung: t.bemerkung, notizen: t.notizen,
    themen: t.themen.map((p) => ({
      themaId: p.freitext ? null : p.themaId,
      titelFreitext: p.freitext ? p.titel : null,
      ausBlockId: p.ausBlockId,
      verantwortliche: p.verantwortliche.map((v) => ({ kameradId: v.kameradId, externePersonId: v.externePersonId, platzhalter: v.platzhalter })),
    })),
  };
}

/** Änderung eines Termins: vorher/nachher null = existierte nicht bzw. nicht mehr. */
export type Aenderung = {
  terminId: number;
  vorher: Zustand | null;
  nachher: Zustand | null;
  /** aktualisiertAm, das der Termin jetzt haben muss (Schutz vor fremden Änderungen). */
  stempel: string | null;
};

export type Eintrag = { text: string; aenderungen: Aenderung[] };

/** Vergleicht zwei Stände eines Plans und liefert die Änderungen (leer = nichts zu merken). */
export function unterschiede(vorher: TerminQuelle[], nachher: TerminQuelle[]): Aenderung[] {
  const alt = new Map(vorher.map((t) => [t.id, t]));
  const neu = new Map(nachher.map((t) => [t.id, t]));
  const out: Aenderung[] = [];
  for (const t of nachher) {
    const a = alt.get(t.id);
    if (!a) out.push({ terminId: t.id, vorher: null, nachher: zustandVon(t), stempel: t.aktualisiertAm });
    else if (a.aktualisiertAm !== t.aktualisiertAm) out.push({ terminId: t.id, vorher: zustandVon(a), nachher: zustandVon(t), stempel: t.aktualisiertAm });
  }
  for (const a of vorher) {
    if (!neu.has(a.id)) out.push({ terminId: a.id, vorher: zustandVon(a), nachher: null, stempel: null });
  }
  return out;
}

/** Nach dem Neuanlegen eines Termins (Rückgängig einer Löschung): alte id in allen Einträgen ersetzen. */
export function ersetzeId(eintraege: Eintrag[], alt: number, neu: number): Eintrag[] {
  return eintraege.map((e) => ({ ...e, aenderungen: e.aenderungen.map((a) => (a.terminId === alt ? { ...a, terminId: neu } : a)) }));
}

export const STAPEL_MAX = 50;
