// Kalender für den Dienstplan: Datumsrechnung, gesetzliche Feiertage in
// Niedersachsen und die Rhythmus-Regeln (Spec Abschnitt 5). Reine Funktionen ohne
// Imports (scripts/test-dienstplan-kalender.mjs lädt die Datei direkt).
//
// Datumswerte sind ISO-Strings "JJJJ-MM-TT" (wie Postgres `date`). Gerechnet wird
// mit Tagesnummern in UTC, damit Sommerzeit und Zeitzonen keine Rolle spielen.

const TAG_MS = 86_400_000;

export function istIsoDatum(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [j, m, t] = s.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

/** Tage seit 1970-01-01. */
export function tagNr(datum: string): number {
  const [j, m, t] = datum.split("-").map(Number);
  return Math.round(Date.UTC(j, m - 1, t) / TAG_MS);
}

export function ausTagNr(nr: number): string {
  const d = new Date(nr * TAG_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export const plusTage = (datum: string, tage: number) => ausTagNr(tagNr(datum) + tage);

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
export function wochentag(datum: string): number {
  return ((tagNr(datum) + 3) % 7 + 7) % 7 + 1; // 1970-01-01 war ein Donnerstag
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

// ── Feiertage ────────────────────────────────────────────────────────────────

/** Ostersonntag (Gauß/Meeus, gregorianisch). */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

/**
 * Gesetzliche Feiertage in Niedersachsen (NFeiertagsG; Reformationstag seit 2018).
 * Lokal berechnet, keine externe Quelle. Ergebnis: Datum → Name.
 */
export function feiertageNiedersachsen(jahr: number): Map<string, string> {
  const ostern = ostersonntag(jahr);
  const liste: [string, string][] = [
    [`${jahr}-01-01`, "Neujahr"],
    [plusTage(ostern, -2), "Karfreitag"],
    [plusTage(ostern, 1), "Ostermontag"],
    [`${jahr}-05-01`, "Tag der Arbeit"],
    [plusTage(ostern, 39), "Christi Himmelfahrt"],
    [plusTage(ostern, 50), "Pfingstmontag"],
    [`${jahr}-10-03`, "Tag der Deutschen Einheit"],
    [`${jahr}-12-25`, "1. Weihnachtsfeiertag"],
    [`${jahr}-12-26`, "2. Weihnachtsfeiertag"],
  ];
  if (jahr >= 2018) liste.push([`${jahr}-10-31`, "Reformationstag"]);
  return new Map(liste.sort((x, y) => x[0].localeCompare(y[0])));
}

// ── Rhythmus ─────────────────────────────────────────────────────────────────

export type RhythmusRegel = {
  id: number;
  name: string;
  typ: "wochen_zyklus" | "monats_wochentag";
  wochentag: number; // ISO 1–7
  uhrzeit: string; // "HH:MM" oder "HH:MM:SS"
  ankerDatum: string | null;
  muster: string[] | null;
  nterWochentag: number | null; // 1–5, -1 = letzter
  monate: number[] | null;
  kategorieKuerzel: string | null;
  gueltigAb: string;
  gueltigBis: string | null;
  aktiv: boolean;
};

export interface RhythmusTreffer {
  regelId: number;
  datum: string;
  kuerzel: string;
  uhrzeit: string; // "HH:MM"
}

const gueltig = (r: RhythmusRegel, datum: string) =>
  r.aktiv && datum >= r.gueltigAb && (r.gueltigBis === null || datum <= r.gueltigBis);

/** Kürzel für ein Datum nach Spec 5.1 (mathematisches mod, auch vor dem Anker); '' = frei. */
export function zyklusKuerzel(anker: string, muster: string[], datum: string): string {
  const woche = Math.floor((tagNr(datum) - tagNr(anker)) / 7);
  return muster[mod(woche, muster.length)] ?? "";
}

/** n-ter Wochentag eines Monats (n = -1: letzter). null, wenn es ihn nicht gibt (z. B. 5. Donnerstag). */
export function nterWochentag(jahr: number, monat: number, isoWochentag: number, n: number): string | null {
  const p = (x: number) => String(x).padStart(2, "0");
  if (n === -1) {
    const naechster = monat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${p(monat + 1)}-01`;
    const ende = plusTage(naechster, -1);
    return plusTage(ende, -mod(wochentag(ende) - isoWochentag, 7));
  }
  const erster = `${jahr}-${p(monat)}-01`;
  const datum = plusTage(erster, mod(isoWochentag - wochentag(erster), 7) + 7 * (n - 1));
  return Number(datum.slice(5, 7)) === monat ? datum : null;
}

/** Alle Treffer einer Regel in einem Jahr (nur gültige Daten, nur der Regel-Wochentag). */
export function regelTreffer(r: RhythmusRegel, jahr: number): RhythmusTreffer[] {
  const uhrzeit = r.uhrzeit.slice(0, 5);
  const out: RhythmusTreffer[] = [];
  if (r.typ === "wochen_zyklus") {
    if (!r.ankerDatum || !r.muster?.length) return out;
    const erster = `${jahr}-01-01`;
    let d = plusTage(erster, mod(r.wochentag - wochentag(erster), 7));
    for (; d.startsWith(String(jahr)); d = plusTage(d, 7)) {
      if (!gueltig(r, d)) continue;
      const k = zyklusKuerzel(r.ankerDatum, r.muster, d).trim();
      if (k) out.push({ regelId: r.id, datum: d, kuerzel: k.toUpperCase(), uhrzeit });
    }
  } else {
    if (r.nterWochentag === null || !r.monate?.length || !r.kategorieKuerzel) return out;
    for (const monat of [...r.monate].sort((a, b) => a - b)) {
      const d = nterWochentag(jahr, monat, r.wochentag, r.nterWochentag);
      if (d && gueltig(r, d)) out.push({ regelId: r.id, datum: d, kuerzel: r.kategorieKuerzel.toUpperCase(), uhrzeit });
    }
  }
  return out;
}

/** Treffer aller Regeln eines Jahres, nach Datum und Uhrzeit sortiert. */
export function rhythmusTreffer(regeln: RhythmusRegel[], jahr: number): RhythmusTreffer[] {
  return regeln.flatMap((r) => regelTreffer(r, jahr))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.uhrzeit.localeCompare(b.uhrzeit) || a.regelId - b.regelId);
}
