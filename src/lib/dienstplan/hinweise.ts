// Datentypen eines geladenen Plans und die Hinweise der Eingabemaske (Spec 7.6).
// Reine Funktionen ohne Imports (scripts/test-dienstplan-eingabe.mjs lädt die
// Datei direkt). Hinweise blockieren nie, sie werden nur angezeigt.

export interface DpVerantwortlicher {
  id: number;
  position: number;
  art: "kamerad" | "extern" | "platzhalter";
  kameradId: number | null;
  externePersonId: number | null;
  platzhalter: "alle_gf" | "offen" | null;
  name: string;
}

export interface DpTerminThema {
  id: number;
  position: number;
  themaId: number | null;
  titel: string;
  freitext: boolean;
  ausBlockId: number | null;
  verantwortliche: DpVerantwortlicher[];
}

export interface DpTermin {
  id: number;
  datum: string;
  uhrzeit: string | null;
  dauerMinuten: number | null;
  kategorieId: number;
  kuerzel: string;
  quelle: "rhythmus" | "manuell";
  regelId: number | null;
  rhythmusDatum: string | null;
  ausgefallen: boolean;
  ort: string | null;
  bemerkung: string | null;
  notizen: string | null;
  aktualisiertAm: string;
  /** Name des gesetzlichen Feiertags in Niedersachsen, sonst null. */
  feiertag: string | null;
  themen: DpTerminThema[];
}

export type DpHinweisArt = "ohne_thema" | "ohne_verantwortliche" | "feiertag" | "doppelt" | "pflichtthema";

export interface DpHinweis {
  art: DpHinweisArt;
  terminId: number | null;
  text: string;
}

const kurz = (datum: string) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;

/**
 * Hinweise zu einem Plan:
 * - Dienstabend (D) ohne Thema, Themenposition eines Dienstabends ohne Verantwortliche
 * - Termin auf einem gesetzlichen Feiertag
 * - Person am selben Tag in mehreren Terminen eingeplant
 * - Pflichtthema (pflicht_jaehrlich, aktiv) kommt im Plan nicht vor
 * Ausgefallene Termine zählen nirgends mit.
 */
export function berechneHinweise(
  termine: DpTermin[],
  pflichtThemen: { id: number; titel: string }[] = [],
): DpHinweis[] {
  const out: DpHinweis[] = [];
  const aktiv = termine.filter((t) => !t.ausgefallen);
  for (const t of aktiv) {
    if (t.feiertag) out.push({ art: "feiertag", terminId: t.id, text: `${kurz(t.datum)} fällt auf einen Feiertag (${t.feiertag})` });
    if (t.kuerzel !== "D") continue;
    if (!t.themen.length) out.push({ art: "ohne_thema", terminId: t.id, text: `Dienstabend ${kurz(t.datum)} ohne Thema` });
    for (const th of t.themen) {
      if (!th.verantwortliche.length) out.push({ art: "ohne_verantwortliche", terminId: t.id, text: `${kurz(t.datum)} „${th.titel}“ ohne Verantwortliche` });
    }
  }
  // Person am selben Tag in mehreren Terminen
  const proTag = new Map<string, Map<number, { name: string; termine: Set<number> }>>();
  for (const t of aktiv) {
    for (const th of t.themen) {
      for (const v of th.verantwortliche) {
        if (v.kameradId === null) continue;
        const tag = proTag.get(t.datum) ?? new Map();
        proTag.set(t.datum, tag);
        const e = tag.get(v.kameradId) ?? { name: v.name, termine: new Set<number>() };
        e.termine.add(t.id);
        tag.set(v.kameradId, e);
      }
    }
  }
  for (const [datum, tag] of [...proTag].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const e of tag.values()) {
      if (e.termine.size > 1) out.push({ art: "doppelt", terminId: Math.min(...e.termine), text: `${e.name} ist am ${kurz(datum)} mehrfach eingeplant` });
    }
  }
  const verplant = new Set(aktiv.flatMap((t) => t.themen.map((th) => th.themaId)).filter((x): x is number => x !== null));
  for (const p of pflichtThemen) {
    if (!verplant.has(p.id)) out.push({ art: "pflichtthema", terminId: null, text: `Pflichtthema „${p.titel}“ fehlt im Plan` });
  }
  return out;
}
