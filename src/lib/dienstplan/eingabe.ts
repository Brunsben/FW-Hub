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

export function pruefePlanNeu(b: Body): Pruefung<{ jahr: number; generieren: boolean; zwischendienstVersatz: number }> {
  return lauf(() => {
    const j = b.jahr;
    if (typeof j !== "number" || !Number.isInteger(j) || j < 2000 || j > 2100) raus("jahr muss zwischen 2000 und 2100 liegen");
    const v = hat(b, "zwischendienstVersatz") ? b.zwischendienstVersatz : 0;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 3) raus("zwischendienstVersatz muss 0 bis 3 Wochen sein");
    return {
      jahr: j as number,
      generieren: hat(b, "generieren") ? bool(b.generieren, "generieren") : true,
      zwischendienstVersatz: v as number,
    };
  });
}

export function pruefePlanStatus(b: Body): Pruefung<{ status: "entwurf" | "freigegeben"; bezeichnung: string | null }> {
  return lauf(() => {
    if (b.status !== "entwurf" && b.status !== "freigegeben") raus("status muss entwurf oder freigegeben sein");
    return { status: b.status as "entwurf" | "freigegeben", bezeichnung: optText(b.bezeichnung, "bezeichnung", 120) };
  });
}

// ── Versionen (Phase 9) ──────────────────────────────────────────────────────

/** Manuelle Version: Bezeichnung Pflicht (z. B. "Stand nach GF-Sitzung"). */
export function pruefeVersion(b: Body): Pruefung<{ bezeichnung: string }> {
  return lauf(() => {
    const bezeichnung = optText(b.bezeichnung, "bezeichnung", 120);
    if (!bezeichnung) raus("Bezeichnung fehlt");
    return { bezeichnung: bezeichnung! };
  });
}

/** Versionsnummer aus der Adresse; "aktuell" nur, wenn erlaubt. */
export function leseVersionNummer(wert: string | null, aktuellErlaubt: boolean): number | "aktuell" | null {
  if (wert === null || wert === "") return null;
  if (aktuellErlaubt && wert === "aktuell") return "aktuell";
  const n = Number(wert);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : null;
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

// ── Verwaltung (Kategorien, Rhythmusregeln, Bereiche) ───────────────────────

export const FARBEN = ["blue", "teal", "orange", "indigo", "pink", "purple", "red", "yellow", "green", "gray"] as const;

export interface KategorieEingabe {
  kuerzel?: string;
  name?: string;
  farbe?: string;
  standardUhrzeit?: string | null;
  standardDauerMinuten?: number;
  sortierung?: number;
  aktiv?: boolean;
}

export function pruefeKategorie(b: Body, modus: Modus): Pruefung<KategorieEingabe> {
  return lauf(() => {
    const t: KategorieEingabe = {};
    const kuerzel = (v: unknown) => {
      const k = pflichtText(v, "kuerzel", 3).toUpperCase();
      if (!/^[A-ZÄÖÜ]{1,3}$/.test(k)) raus("kuerzel: 1 bis 3 Buchstaben");
      if (k === "F") raus("F ist kein Kürzel: ausgefallene Termine werden als ausgefallen markiert");
      return k;
    };
    const farbe = (v: unknown) => {
      if (typeof v !== "string" || !(FARBEN as readonly string[]).includes(v)) raus(`farbe muss eine von ${FARBEN.join(", ")} sein`);
      return v as string;
    };
    if (modus === "neu") {
      t.kuerzel = kuerzel(b.kuerzel);
      t.name = pflichtText(b.name, "name", 60);
      t.farbe = farbe(b.farbe);
    } else {
      setze(t, b, "kuerzel", kuerzel);
      setze(t, b, "name", (v) => pflichtText(v, "name", 60));
      setze(t, b, "farbe", farbe);
    }
    setze(t, b, "standardUhrzeit", uhrzeit);
    setze(t, b, "standardDauerMinuten", (v) => {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 1440) raus("standardDauerMinuten muss zwischen 1 und 1440 liegen");
      return v;
    });
    setze(t, b, "sortierung", (v) => {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 999) raus("sortierung muss zwischen 0 und 999 liegen");
      return v;
    });
    setze(t, b, "aktiv", (v) => bool(v, "aktiv"));
    if (modus === "aendern" && !Object.keys(t).length) raus("Keine änderbaren Felder im Body");
    return t;
  });
}

export interface RegelEingabe {
  name?: string;
  typ?: "wochen_zyklus" | "monats_wochentag";
  wochentag?: number;
  uhrzeit?: string;
  ankerDatum?: string | null;
  muster?: string[] | null;
  nterWochentag?: number | null;
  monate?: number[] | null;
  kategorieKuerzel?: string | null;
  gueltigAb?: string;
  gueltigBis?: string | null;
  aktiv?: boolean;
}

/** Felder einzeln prüfen; die Vollständigkeit je Typ prüft pruefeRegelVollstaendig nach dem Zusammenführen. */
export function pruefeRegel(b: Body, modus: Modus): Pruefung<RegelEingabe> {
  return lauf(() => {
    const t: RegelEingabe = {};
    const typ = (v: unknown) => {
      if (v !== "wochen_zyklus" && v !== "monats_wochentag") raus("typ muss wochen_zyklus oder monats_wochentag sein");
      return v;
    };
    const ganz = (feld: string, min: number, max: number) => (v: unknown) => {
      if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) raus(`${feld} muss zwischen ${min} und ${max} liegen`);
      return v;
    };
    if (modus === "neu") {
      t.name = pflichtText(b.name, "name", 100);
      t.typ = typ(b.typ) as RegelEingabe["typ"];
      t.wochentag = ganz("wochentag", 1, 7)(b.wochentag) as number;
      t.uhrzeit = uhrzeit(b.uhrzeit) ?? raus("uhrzeit fehlt");
      t.gueltigAb = datum(b.gueltigAb, "gueltigAb");
    } else {
      setze(t, b, "name", (v) => pflichtText(v, "name", 100));
      setze(t, b, "typ", typ);
      setze(t, b, "wochentag", ganz("wochentag", 1, 7));
      setze(t, b, "uhrzeit", (v) => uhrzeit(v) ?? raus("uhrzeit darf nicht leer sein"));
      setze(t, b, "gueltigAb", (v) => datum(v, "gueltigAb"));
    }
    setze(t, b, "ankerDatum", (v) => (v === null ? null : datum(v, "ankerDatum")));
    setze(t, b, "muster", (v) => {
      if (v === null) return null;
      if (!Array.isArray(v) || v.length < 1 || v.length > 26) raus("muster: 1 bis 26 Wochen");
      return (v as unknown[]).map((x) => {
        if (typeof x !== "string" || !/^[A-Za-zÄÖÜäöü]{0,3}$/.test(x.trim())) raus("muster: je Woche ein Kürzel oder leer");
        return (x as string).trim().toUpperCase();
      });
    });
    setze(t, b, "nterWochentag", (v) => {
      if (v === null) return null;
      if (![1, 2, 3, 4, 5, -1].includes(v as number)) raus("nterWochentag muss 1 bis 5 oder -1 (letzter) sein");
      return v;
    });
    setze(t, b, "monate", (v) => {
      if (v === null) return null;
      if (!Array.isArray(v) || !v.length) raus("monate: mindestens ein Monat");
      const m = (v as unknown[]).map((x) => ganz("monate[]", 1, 12)(x) as number);
      if (new Set(m).size !== m.length) raus("monate enthält einen Monat doppelt");
      return m.sort((x, y) => x - y);
    });
    setze(t, b, "kategorieKuerzel", (v) => (v === null ? null : pflichtText(v, "kategorieKuerzel", 3).toUpperCase()));
    setze(t, b, "gueltigBis", (v) => (v === null ? null : datum(v, "gueltigBis")));
    setze(t, b, "aktiv", (v) => bool(v, "aktiv"));
    if (modus === "aendern" && !Object.keys(t).length) raus("Keine änderbaren Felder im Body");
    return t;
  });
}

/** Vollständigkeit einer Regel nach dem Zusammenführen mit dem gespeicherten Stand. */
export function pruefeRegelVollstaendig(r: RegelEingabe): string | null {
  if (r.gueltigBis && r.gueltigAb && r.gueltigBis < r.gueltigAb) return "gueltigBis liegt vor gueltigAb";
  if (r.typ === "wochen_zyklus") {
    if (!r.ankerDatum) return "wochen_zyklus braucht ankerDatum";
    if (!r.muster?.length || !r.muster.some((m) => m)) return "wochen_zyklus braucht ein Muster mit mindestens einem Kürzel";
  }
  if (r.typ === "monats_wochentag") {
    if (r.nterWochentag === null || r.nterWochentag === undefined) return "monats_wochentag braucht nterWochentag";
    if (!r.monate?.length) return "monats_wochentag braucht monate";
    if (!r.kategorieKuerzel) return "monats_wochentag braucht kategorieKuerzel";
  }
  return null;
}

export function pruefeBereich(b: Body, modus: Modus): Pruefung<{ name?: string; sortierung?: number }> {
  return lauf(() => {
    const t: { name?: string; sortierung?: number } = {};
    if (modus === "neu") t.name = pflichtText(b.name, "name", 100);
    else setze(t, b, "name", (v) => pflichtText(v, "name", 100));
    setze(t, b, "sortierung", (v) => {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 999) raus("sortierung muss zwischen 0 und 999 liegen");
      return v;
    });
    if (modus === "aendern" && !Object.keys(t).length) raus("Keine änderbaren Felder im Body");
    return t;
  });
}

// ── Termin-Zustand (Rückgängig/Wiederholen, Phase 7) ────────────────────────
// Vollständiges Abbild eines Termins: Felder, Themen in Reihenfolge und deren
// Verantwortliche. PUT /termine/[id]/zustand ersetzt den Termin damit komplett.

export interface TerminZustandThema {
  themaId: number | null;
  titelFreitext: string | null;
  ausBlockId: number | null;
  verantwortliche: { kameradId: number | null; externePersonId: number | null; platzhalter: "alle_gf" | "offen" | null }[];
}

export interface TerminZustand {
  datum: string;
  uhrzeit: string | null;
  dauerMinuten: number | null;
  kategorieId: number;
  ausgefallen: boolean;
  ort: string | null;
  bemerkung: string | null;
  notizen: string | null;
  themen: TerminZustandThema[];
}

export function pruefeTerminZustand(b: Body): Pruefung<TerminZustand> {
  return lauf(() => {
    const t = pruefeTermin({ uhrzeit: null, dauerMinuten: null, ausgefallen: false, ort: null, bemerkung: null, notizen: null, ...b }, "neu");
    if (!t.ok) raus(t.ok ? "" : t.fehler);
    const f = (t as { ok: true; daten: TerminEingabe }).daten;
    if (!Array.isArray(b.themen)) raus("themen muss eine Liste sein");
    const roh = b.themen as unknown[];
    if (roh.length > 30) raus("Höchstens 30 Themen je Termin");
    const themen = roh.map((x, i): TerminZustandThema => {
      if (!x || typeof x !== "object") raus(`themen[${i}] ungültig`);
      const o = x as Body;
      const themaId = o.themaId === undefined ? null : optId(o.themaId, `themen[${i}].themaId`);
      const titelFreitext = optText(o.titelFreitext, `themen[${i}].titelFreitext`, 200);
      if ((themaId === null) === (titelFreitext === null)) raus(`themen[${i}]: genau eins von themaId oder titelFreitext`);
      const ausBlockId = o.ausBlockId === undefined ? null : optId(o.ausBlockId, `themen[${i}].ausBlockId`);
      if (!Array.isArray(o.verantwortliche)) raus(`themen[${i}].verantwortliche muss eine Liste sein`);
      const vs = o.verantwortliche as unknown[];
      if (vs.length > 20) raus(`themen[${i}]: höchstens 20 Verantwortliche`);
      const verantwortliche = vs.map((y, j) => {
        const v = (y && typeof y === "object" ? y : raus(`themen[${i}].verantwortliche[${j}] ungültig`)) as Body;
        const kameradId = v.kameradId === undefined ? null : optId(v.kameradId, "kameradId");
        const externePersonId = v.externePersonId === undefined ? null : optId(v.externePersonId, "externePersonId");
        const p = v.platzhalter ?? null;
        if (p !== null && p !== "alle_gf" && p !== "offen") raus("platzhalter muss alle_gf oder offen sein");
        if ([kameradId, externePersonId, p].filter((z) => z !== null).length !== 1) {
          raus(`themen[${i}].verantwortliche[${j}]: genau eins von kameradId, externePersonId, platzhalter`);
        }
        return { kameradId, externePersonId, platzhalter: p as "alle_gf" | "offen" | null };
      });
      return { themaId, titelFreitext, ausBlockId, verantwortliche };
    });
    return {
      datum: f.datum!, uhrzeit: f.uhrzeit ?? null, dauerMinuten: f.dauerMinuten ?? null, kategorieId: f.kategorieId!,
      ausgefallen: f.ausgefallen ?? false, ort: f.ort ?? null, bemerkung: f.bemerkung ?? null, notizen: f.notizen ?? null, themen,
    };
  });
}

// ── Themenvorschläge (Pool, Phase 8) ─────────────────────────────────────────

export function pruefeVorschlag(b: Body): Pruefung<{ titel: string; beschreibung: string | null }> {
  return lauf(() => ({
    titel: pflichtText(b.titel, "titel", 200),
    beschreibung: optText(b.beschreibung, "beschreibung", 2000, true),
  }));
}

export function pruefeVorschlagStatus(b: Body): Pruefung<{ status: "offen" | "verworfen" }> {
  return lauf(() => {
    if (b.status !== "offen" && b.status !== "verworfen") raus("status muss offen oder verworfen sein (übernehmen über /uebernehmen)");
    return { status: b.status as "offen" | "verworfen" };
  });
}

export function pruefeUebernehmen(b: Body): Pruefung<{ terminId: number | null }> {
  return lauf(() => ({ terminId: b.terminId === undefined || b.terminId === null ? null : id(b.terminId, "terminId") }));
}
