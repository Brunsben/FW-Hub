// Versionen eines Plans (Spec 8, Phase 9): Abbild, Vergleich, "geändert seit
// Freigabe". Reine Funktionen ohne Imports (scripts/test-dienstplan-versionen-lib.mjs
// lädt die Datei direkt).
//
// Ein Abbild enthält je Termin den vollständigen Zustand (wie Rückgängig, siehe
// rueckgaengig.ts) plus die Texte zum Zeitpunkt (Thementitel, Anzeigenamen), damit
// eine alte Version auch nach Umbenennungen lesbar bleibt.

export type VVerantwortlicher = {
  kameradId: number | null; externePersonId: number | null; platzhalter: "alle_gf" | "offen" | null; name: string;
};
export type VThema = {
  themaId: number | null; titelFreitext: string | null; ausBlockId: number | null; titel: string; verantwortliche: VVerantwortlicher[];
};
export type VTermin = {
  id: number; datum: string; uhrzeit: string | null; dauerMinuten: number | null; kategorieId: number; kuerzel: string;
  quelle: string; regelId: number | null; rhythmusDatum: string | null;
  ausgefallen: boolean; ort: string | null; bemerkung: string | null; notizen: string | null; themen: VThema[];
};
export type VersionInhalt = { format: 1; jahr: number; termine: VTermin[] };

/** Minimal benötigte Form eines geladenen Termins (DpTermin aus ladePlan erfüllt sie). */
export type AbbildQuelle = {
  id: number; datum: string; uhrzeit: string | null; dauerMinuten: number | null; kategorieId: number; kuerzel: string;
  quelle: string; regelId: number | null; rhythmusDatum: string | null;
  ausgefallen: boolean; ort: string | null; bemerkung: string | null; notizen: string | null;
  themen: { themaId: number | null; titel: string; freitext: boolean; ausBlockId: number | null;
    verantwortliche: { kameradId: number | null; externePersonId: number | null; platzhalter: "alle_gf" | "offen" | null; name: string }[] }[];
};

export function abbildAus(jahr: number, termine: AbbildQuelle[]): VersionInhalt {
  return {
    format: 1,
    jahr,
    termine: termine.map((t) => ({
      id: t.id, datum: t.datum, uhrzeit: t.uhrzeit, dauerMinuten: t.dauerMinuten, kategorieId: t.kategorieId, kuerzel: t.kuerzel,
      quelle: t.quelle, regelId: t.regelId, rhythmusDatum: t.rhythmusDatum,
      ausgefallen: t.ausgefallen, ort: t.ort, bemerkung: t.bemerkung, notizen: t.notizen,
      themen: t.themen.map((p) => ({
        themaId: p.freitext ? null : p.themaId,
        titelFreitext: p.freitext ? p.titel : null,
        ausBlockId: p.ausBlockId,
        titel: p.titel,
        verantwortliche: p.verantwortliche.map((v) => ({ kameradId: v.kameradId, externePersonId: v.externePersonId, platzhalter: v.platzhalter, name: v.name })),
      })),
    })),
  };
}

const bezugVon = (v: VVerantwortlicher) => v.kameradId !== null ? `k${v.kameradId}` : v.externePersonId !== null ? `e${v.externePersonId}` : `p${v.platzhalter}`;
const themaSchluessel = (p: VThema) => (p.themaId !== null ? `t${p.themaId}` : `f${p.titelFreitext}`);

/** Inhalt eines Termins ohne Texte zum Zeitpunkt (Umbenennungen zählen nicht als Änderung). */
export function fingerabdruck(t: VTermin): string {
  return JSON.stringify([
    t.datum, t.uhrzeit, t.dauerMinuten, t.kategorieId, t.ausgefallen, t.ort, t.bemerkung, t.notizen,
    t.themen.map((p) => [themaSchluessel(p), p.ausBlockId, p.verantwortliche.map(bezugVon)]),
  ]);
}

export type VergleichArt = "neu" | "entfallen" | "verschoben" | "geaendert";
export type VergleichEintrag = {
  art: VergleichArt;
  /** Termin im neueren Stand (bei "entfallen" der ältere). */
  terminId: number;
  datum: string;
  kuerzel: string;
  alt: { datum: string; uhrzeit: string | null; titel: string } | null;
  neu: { datum: string; uhrzeit: string | null; titel: string } | null;
  details: string[];
};

export const titelVon = (t: Pick<VTermin, "themen">) => t.themen.map((p) => p.titel).join(" / ");
const namenVon = (t: VTermin) => t.themen.map((p) => p.verantwortliche.map((v) => v.name).join(", ")).join(" / ");
const kurzDatum = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const kopf = (t: VTermin) => ({ datum: t.datum, uhrzeit: t.uhrzeit, titel: titelVon(t) });

function details(a: VTermin, n: VTermin): string[] {
  const d: string[] = [];
  if (a.datum !== n.datum) d.push(`Datum ${kurzDatum(a.datum)} → ${kurzDatum(n.datum)}`);
  if (a.uhrzeit !== n.uhrzeit) d.push(`Uhrzeit ${a.uhrzeit ?? "–"} → ${n.uhrzeit ?? "–"}`);
  if (a.dauerMinuten !== n.dauerMinuten) d.push("Dauer");
  if (a.kategorieId !== n.kategorieId) d.push(`Kategorie ${a.kuerzel} → ${n.kuerzel}`);
  if (a.ausgefallen !== n.ausgefallen) d.push(n.ausgefallen ? "abgesagt" : "findet wieder statt");
  if (a.themen.map(themaSchluessel).join("|") !== n.themen.map(themaSchluessel).join("|")) d.push("Thema");
  else if (a.themen.map((p) => p.ausBlockId).join("|") !== n.themen.map((p) => p.ausBlockId).join("|")) d.push("Block");
  const va = a.themen.map((p) => p.verantwortliche.map(bezugVon).sort().join(",")).join("|");
  const vn = n.themen.map((p) => p.verantwortliche.map(bezugVon).sort().join(",")).join("|");
  if (va !== vn) d.push("Verantwortliche");
  else if (a.themen.map((p) => p.verantwortliche.map(bezugVon).join(",")).join("|") !== n.themen.map((p) => p.verantwortliche.map(bezugVon).join(",")).join("|")) d.push("Reihenfolge der Verantwortlichen");
  if (a.ort !== n.ort) d.push("Ort");
  if (a.bemerkung !== n.bemerkung) d.push("Bemerkung");
  if (a.notizen !== n.notizen) d.push("Notizen");
  return d;
}

/**
 * Vergleich zweier Stände (Spec 8): neu, entfallen, verschoben (Datum oder
 * Uhrzeit), geändert (Thema, Verantwortliche, sonstige Felder). Zuordnung über
 * die Termin-id; was so nicht zusammenpasst (z. B. nach einer Wiederherstellung
 * mit neuen ids), wird über gleiches Datum und gleiche Kategorie gepaart.
 * Sortiert nach Datum.
 */
export function vergleiche(alt: VTermin[], neu: VTermin[]): VergleichEintrag[] {
  const altPerId = new Map(alt.map((t) => [t.id, t]));
  const paare: [VTermin, VTermin][] = [];
  const offenNeu: VTermin[] = [];
  const benutzt = new Set<number>();
  for (const n of neu) {
    const a = altPerId.get(n.id);
    if (a) { paare.push([a, n]); benutzt.add(a.id); } else offenNeu.push(n);
  }
  const offenAlt = alt.filter((a) => !benutzt.has(a.id));
  const neuOhnePaar: VTermin[] = [];
  for (const n of offenNeu) {
    const i = offenAlt.findIndex((a) => a.datum === n.datum && a.kuerzel === n.kuerzel);
    if (i >= 0) { paare.push([offenAlt[i], n]); offenAlt.splice(i, 1); } else neuOhnePaar.push(n);
  }
  const out: VergleichEintrag[] = [];
  for (const [a, n] of paare) {
    if (fingerabdruck(a) === fingerabdruck(n)) continue;
    const d = details(a, n);
    if (d.length === 0) continue;
    const verschoben = a.datum !== n.datum || a.uhrzeit !== n.uhrzeit;
    out.push({ art: verschoben ? "verschoben" : "geaendert", terminId: n.id, datum: n.datum, kuerzel: n.kuerzel, alt: kopf(a), neu: kopf(n), details: d });
  }
  for (const n of neuOhnePaar) out.push({ art: "neu", terminId: n.id, datum: n.datum, kuerzel: n.kuerzel, alt: null, neu: kopf(n), details: [] });
  for (const a of offenAlt) out.push({ art: "entfallen", terminId: a.id, datum: a.datum, kuerzel: a.kuerzel, alt: kopf(a), neu: null, details: [] });
  return out.sort((x, y) => x.datum.localeCompare(y.datum) || x.terminId - y.terminId);
}

/**
 * Termine, die sich seit der letzten Freigabe geändert haben oder neu sind
 * (Spec 8: berechnet, nicht gespeichert). Ohne Freigabe-Version: keine.
 */
export function geaendertSeitFreigabe(freigabe: VTermin[] | null, aktuell: VTermin[]): Set<number> {
  if (!freigabe) return new Set();
  const alt = new Map(freigabe.map((t) => [t.id, fingerabdruck(t)]));
  return new Set(aktuell.filter((t) => alt.get(t.id) !== fingerabdruck(t)).map((t) => t.id));
}

/** Wiederherstellen: was ist zu tun, damit der Plan dem Abbild entspricht? */
export function wiederherstellPlan(aktuell: VTermin[], ziel: VTermin[]): { aendern: VTermin[]; anlegen: VTermin[]; loeschen: number[] } {
  const jetzt = new Map(aktuell.map((t) => [t.id, t]));
  const aendern: VTermin[] = [];
  const anlegen: VTermin[] = [];
  for (const z of ziel) {
    const j = jetzt.get(z.id);
    if (!j) anlegen.push(z);
    else if (fingerabdruck(j) !== fingerabdruck(z)) aendern.push(z);
  }
  const zielIds = new Set(ziel.map((z) => z.id));
  return { aendern, anlegen, loeschen: aktuell.filter((t) => !zielIds.has(t.id)).map((t) => t.id) };
}

/** Kurzfassung für Listen: "3 neu, 1 entfallen, 2 verschoben, 4 geändert". */
export function zusammenfassung(e: VergleichEintrag[]): string {
  const n = (art: VergleichArt) => e.filter((x) => x.art === art).length;
  const teile = [[n("neu"), "neu"], [n("entfallen"), "entfallen"], [n("verschoben"), "verschoben"], [n("geaendert"), "geändert"]]
    .filter(([z]) => (z as number) > 0).map(([z, t]) => `${z} ${t}`);
  return teile.length ? teile.join(", ") : "keine Änderungen";
}

export { namenVon };
