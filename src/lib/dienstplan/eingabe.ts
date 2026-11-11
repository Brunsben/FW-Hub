// Eingabeprüfung der Dienstplan-API. Reine Funktionen ohne Imports
// (scripts/test-dienstplan-eingabe.mjs lädt die Datei direkt).
//
// Regeln: Unbekannte Felder werden ignoriert. Felder, die im Body fehlen, bleiben
// beim Ändern unverändert ("aendern"); beim Anlegen gelten Pflichtfelder. null
// leert ein optionales Feld. Texte werden getrimmt, leere optionale Texte → null.

export type Pruefung<T> = { ok: true; daten: T } | { ok: false; fehler: string };
type Body = Record<string, unknown>;
type Modus = "neu" | "aendern";

class Ungueltig extends Error {}
const raus = (m: string): never => { throw new Ungueltig(m); };

function lauf<T>(f: () => T): Pruefung<T> {
  try {
    return { ok: true, daten: f() };
  } catch (e) {
    if (e instanceof Ungueltig) return { ok: false, fehler: e.message };
    throw e;
  }
}

const hat = (b: Body, k: string) => Object.prototype.hasOwnProperty.call(b, k);

function istDatum(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [j, m, t] = s.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

function pflichtText(v: unknown, feld: string, max: number): string {
  if (typeof v !== "string" || !v.trim()) raus(`${feld} fehlt`);
  const s = (v as string).normalize("NFC").trim().replace(/\s+/g, " ");
  if (s.length > max) raus(`${feld} ist zu lang (höchstens ${max} Zeichen)`);
  return s;
}

function optText(v: unknown, feld: string, max: number, mehrzeilig = false): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") raus(`${feld} muss Text sein`);
  let s = (v as string).normalize("NFC").trim();
  if (!mehrzeilig) s = s.replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length > max) raus(`${feld} ist zu lang (höchstens ${max} Zeichen)`);
  return s;
}

function bool(v: unknown, feld: string): boolean {
  if (typeof v !== "boolean") raus(`${feld} muss true oder false sein`);
  return v as boolean;
}

function id(v: unknown, feld: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) raus(`${feld} muss eine positive ganze Zahl sein`);
  return v as number;
}

function optId(v: unknown, feld: string): number | null {
  return v === null ? null : id(v, feld);
}

/** "HH:MM" oder "HH:MM:SS" → "HH:MM"; null erlaubt. */
function uhrzeit(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)) raus("uhrzeit muss HH:MM sein");
  return (v as string).slice(0, 5);
}

function datum(v: unknown, feld = "datum"): string {
  if (typeof v !== "string" || !istDatum(v)) raus(`${feld} muss ein Datum JJJJ-MM-TT sein`);
  return v as string;
}

function setze<T extends object>(ziel: T, b: Body, k: string, f: (v: unknown) => unknown) {
  if (hat(b, k)) (ziel as Record<string, unknown>)[k] = f(b[k]);
}

// ── Pläne ────────────────────────────────────────────────────────────────────

export function pruefePlanNeu(b: Body): Pruefung<{ jahr: number; generieren: boolean }> {
  return lauf(() => {
    const j = b.jahr;
    if (typeof j !== "number" || !Number.isInteger(j) || j < 2000 || j > 2100) raus("jahr muss zwischen 2000 und 2100 liegen");
    return { jahr: j as number, generieren: hat(b, "generieren") ? bool(b.generieren, "generieren") : true };
  });
}

export function pruefePlanStatus(b: Body): Pruefung<{ status: "entwurf" | "freigegeben" }> {
  return lauf(() => {
    if (b.status !== "entwurf" && b.status !== "freigegeben") raus("status muss entwurf oder freigegeben sein");
    return { status: b.status as "entwurf" | "freigegeben" };
  });
}

// ── Termine ──────────────────────────────────────────────────────────────────

export interface TerminEingabe {
  datum?: string;
  uhrzeit?: string | null;
  dauerMinuten?: number | null;
  kategorieId?: number;
  ausgefallen?: boolean;
  ort?: string | null;
  bemerkung?: string | null;
  notizen?: string | null;
}

export function pruefeTermin(b: Body, modus: Modus): Pruefung<TerminEingabe> {
  return lauf(() => {
    const t: TerminEingabe = {};
    if (modus === "neu") {
      t.datum = datum(b.datum);
      t.kategorieId = id(b.kategorieId, "kategorieId");
    } else {
      setze(t, b, "datum", (v) => datum(v));
      setze(t, b, "kategorieId", (v) => id(v, "kategorieId"));
    }
    setze(t, b, "uhrzeit", uhrzeit);
    setze(t, b, "dauerMinuten", (v) => {
      if (v === null) return null;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 1440) raus("dauerMinuten muss zwischen 1 und 1440 liegen");
      return v;
    });
    setze(t, b, "ausgefallen", (v) => bool(v, "ausgefallen"));
    setze(t, b, "ort", (v) => optText(v, "ort", 200));
    setze(t, b, "bemerkung", (v) => optText(v, "bemerkung", 200));
    setze(t, b, "notizen", (v) => optText(v, "notizen", 4000, true));
    if (modus === "aendern" && !Object.keys(t).length) raus("Keine änderbaren Felder im Body");
    return t;
  });
}

// ── Themen am Termin, Verantwortliche ────────────────────────────────────────

export type TerminThemaEingabe =
  | { art: "thema"; themaId: number }
  | { art: "freitext"; titel: string }
  | { art: "block"; blockId: number };

export function pruefeTerminThema(b: Body): Pruefung<TerminThemaEingabe> {
  return lauf(() => {
    const angaben = ["themaId", "titelFreitext", "blockId"].filter((k) => b[k] !== undefined && b[k] !== null);
    if (angaben.length !== 1) raus("Genau eins von themaId, titelFreitext oder blockId angeben");
    if (angaben[0] === "themaId") return { art: "thema" as const, themaId: id(b.themaId, "themaId") };
    if (angaben[0] === "blockId") return { art: "block" as const, blockId: id(b.blockId, "blockId") };
    return { art: "freitext" as const, titel: pflichtText(b.titelFreitext, "titelFreitext", 200) };
  });
}

/** Verschieben/Umsortieren einer Themenposition: neue Position (ab 1) und/oder anderer Termin. */
export function pruefeTerminThemaAendern(b: Body): Pruefung<{ position?: number; terminId?: number }> {
  return lauf(() => {
    const out: { position?: number; terminId?: number } = {};
    setze(out, b, "position", (v) => id(v, "position"));
    setze(out, b, "terminId", (v) => id(v, "terminId"));
    if (!Object.keys(out).length) raus("position oder terminId angeben");
    return out;
  });
}

export type VerantwortlicherEingabe = { art: "kamerad"; kameradId: number } | { art: "extern"; externePersonId: number };

export function pruefeVerantwortlicher(b: Body): Pruefung<VerantwortlicherEingabe> {
  return lauf(() => {
    const angaben = ["kameradId", "externePersonId"].filter((k) => b[k] !== undefined && b[k] !== null);
    if (angaben.length !== 1) raus("Genau eins von kameradId oder externePersonId angeben");
    if (hat(b, "platzhalter")) raus("Platzhalter gibt es nur in importierten Altdaten");
    return angaben[0] === "kameradId"
      ? { art: "kamerad" as const, kameradId: id(b.kameradId, "kameradId") }
      : { art: "extern" as const, externePersonId: id(b.externePersonId, "externePersonId") };
  });
}

// ── Kataloge ─────────────────────────────────────────────────────────────────

export interface ThemaEingabe {
  titel?: string;
  kurztitel?: string | null;
  bereichId?: number | null;
  notizen?: string | null;
  pflichtJaehrlich?: boolean;
  zielgruppe?: string | null;
  aktiv?: boolean;
}

export function pruefeThema(b: Body, modus: Modus): Pruefung<ThemaEingabe> {
  return lauf(() => {
    const t: ThemaEingabe = {};
    if (modus === "neu") t.titel = pflichtText(b.titel, "titel", 200);
    else setze(t, b, "titel", (v) => pflichtText(v, "titel", 200));
    setze(t, b, "kurztitel", (v) => optText(v, "kurztitel", 60));
    setze(t, b, "bereichId", (v) => optId(v, "bereichId"));
    setze(t, b, "notizen", (v) => optText(v, "notizen", 4000, true));
    setze(t, b, "pflichtJaehrlich", (v) => bool(v, "pflichtJaehrlich"));
    setze(t, b, "zielgruppe", (v) => optText(v, "zielgruppe", 100));
    setze(t, b, "aktiv", (v) => bool(v, "aktiv"));
    if (modus === "aendern" && !Object.keys(t).length) raus("Keine änderbaren Felder im Body");
    return t;
  });
}

export interface BlockEingabe {
  name?: string;
  themaIds?: number[];
  aktiv?: boolean;
}

export function pruefeBlock(b: Body, modus: Modus): Pruefung<BlockEingabe> {
  return lauf(() => {
    const t: BlockEingabe = {};
    if (modus === "neu") t.name = pflichtText(b.name, "name", 200);
    else setze(t, b, "name", (v) => pflichtText(v, "name", 200));
    const ids = (v: unknown) => {
      if (!Array.isArray(v) || v.length < 2 || v.length > 20) raus("themaIds muss 2 bis 20 Themen enthalten");
      const liste = (v as unknown[]).map((x) => id(x, "themaIds[]"));
      if (new Set(liste).size !== liste.length) raus("themaIds enthält ein Thema doppelt");
      return liste;
    };
    if (modus === "neu") t.themaIds = ids(b.themaIds);
    else setze(t, b, "themaIds", ids);
    setze(t, b, "aktiv", (v) => bool(v, "aktiv"));
    if (modus === "aendern" && !Object.keys(t).length) raus("Keine änderbaren Felder im Body");
    return t;
  });
}

export interface ExternePersonEingabe {
  name?: string | null;
  organisation?: string | null;
  funktion?: string | null;
  email?: string | null;
  aktiv?: boolean;
}

export function pruefeExternePerson(b: Body, modus: Modus): Pruefung<ExternePersonEingabe> {
  return lauf(() => {
    const t: ExternePersonEingabe = {};
    setze(t, b, "name", (v) => optText(v, "name", 100));
    setze(t, b, "organisation", (v) => optText(v, "organisation", 100));
    setze(t, b, "funktion", (v) => optText(v, "funktion", 100));
    setze(t, b, "email", (v) => {
      const s = optText(v, "email", 200);
      if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) raus("email ist keine gültige Adresse");
      return s;
    });
    setze(t, b, "aktiv", (v) => bool(v, "aktiv"));
    if (modus === "neu" && !t.name && !t.organisation) raus("name oder organisation angeben");
    if (modus === "aendern" && !Object.keys(t).length) raus("Keine änderbaren Felder im Body");
    return t;
  });
}
