// Exporte des Dienstplans (Spec 9, Phase 10): gemeinsame Termindaten, CSV nach
// Exportprofil, Änderungsexport, iCal. Reine Funktionen ohne Imports
// (scripts/test-dienstplan-export-lib.mjs lädt die Datei direkt).

// ── Gemeinsame Termindaten ───────────────────────────────────────────────────

export type ExportQuelle = {
  id: number; datum: string; uhrzeit: string | null; dauerMinuten: number | null; kategorieId: number; kuerzel: string;
  ausgefallen: boolean; ort: string | null; bemerkung: string | null; aktualisiertAm: string;
  themen: { titel: string; verantwortliche: { name: string }[] }[];
};
export type ExportKategorie = { id: number; kuerzel: string; name: string; standardDauerMinuten: number };

export type ExportTermin = {
  terminId: number;
  /** "JJJJ-MM-TT" */ startDatum: string;
  /** "HH:MM" oder null (ganztägig) */ startZeit: string | null;
  endeDatum: string;
  endeZeit: string | null;
  ganztaegig: boolean;
  kategorieKuerzel: string;
  kategorieName: string;
  titel: string;
  verantwortliche: string;
  beschreibung: string;
  ort: string;
  bemerkung: string;
  ausgefallen: boolean;
  aktualisiertAm: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Datum + Minuten, auch über Mitternacht (reine Kalenderrechnung, ohne Zeitzone). */
export function plusMinuten(datum: string, zeit: string, minuten: number): { datum: string; zeit: string } {
  const [j, m, t] = datum.split("-").map(Number);
  const [h, mi] = zeit.split(":").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t, h, mi + minuten));
  return {
    datum: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    zeit: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

/** "Thema – Verantwortliche" je Zeile, darunter die Bemerkung. */
export function beschreibungVon(t: Pick<ExportQuelle, "themen" | "bemerkung">): string {
  const zeilen = t.themen.map((p) => (p.verantwortliche.length ? `${p.titel} – ${p.verantwortliche.map((v) => v.name).join(", ")}` : p.titel));
  if (t.bemerkung) zeilen.push(t.bemerkung);
  return zeilen.join("\n");
}

export function exportTermine(termine: ExportQuelle[], kategorien: ExportKategorie[]): ExportTermin[] {
  const kat = new Map(kategorien.map((k) => [k.id, k]));
  return termine.map((t) => {
    const k = kat.get(t.kategorieId);
    const dauer = t.dauerMinuten ?? k?.standardDauerMinuten ?? 120;
    const ende = t.uhrzeit ? plusMinuten(t.datum, t.uhrzeit, dauer) : null;
    const titel = t.themen.map((p) => p.titel).join(" / ");
    return {
      terminId: t.id,
      startDatum: t.datum,
      startZeit: t.uhrzeit,
      endeDatum: ende ? ende.datum : t.datum,
      endeZeit: ende ? ende.zeit : null,
      ganztaegig: !t.uhrzeit,
      kategorieKuerzel: t.kuerzel,
      kategorieName: k?.name ?? t.kuerzel,
      titel: titel || (k?.name ?? t.kuerzel),
      verantwortliche: t.themen.map((p) => p.verantwortliche.map((v) => v.name).join(", ")).filter(Boolean).join(" / "),
      beschreibung: beschreibungVon(t),
      ort: t.ort ?? "",
      bemerkung: t.bemerkung ?? "",
      ausgefallen: t.ausgefallen,
      aktualisiertAm: t.aktualisiertAm,
    };
  });
}

/** Termine eines Halbjahres (1, 2) bzw. alle (null). */
export const imHalbjahr = (datum: string, halbjahr: 1 | 2 | null) =>
  halbjahr === null || (Number(datum.slice(5, 7)) <= 6 ? 1 : 2) === halbjahr;

// ── Zeitzone Europe/Berlin ───────────────────────────────────────────────────

/** Letzter Sonntag eines Monats (UTC-Tag). */
function letzterSonntag(jahr: number, monat: number): number {
  const d = new Date(Date.UTC(jahr, monat, 0));
  return d.getUTCDate() - d.getUTCDay();
}
/** UTC-Versatz in Minuten für eine Ortszeit in Berlin (MESZ von letztem So im März 02:00 bis letztem So im Oktober 03:00). */
export function berlinVersatz(datum: string, zeit: string): number {
  const [j, m, t] = datum.split("-").map(Number);
  const [h] = zeit.split(":").map(Number);
  const beginn = letzterSonntag(j, 3), ende = letzterSonntag(j, 10);
  const sommer = (m > 3 && m < 10) || (m === 3 && (t > beginn || (t === beginn && h >= 2))) || (m === 10 && (t < ende || (t === ende && h < 3)));
  return sommer ? 120 : 60;
}
export function isoMitVersatz(datum: string, zeit: string): string {
  const v = berlinVersatz(datum, zeit);
  return `${datum}T${zeit}:00+${pad(v / 60)}:00`;
}

// ── CSV nach Exportprofil (Spec 9.5) ─────────────────────────────────────────

export const EXPORT_FELDER = [
  "startDatum", "startZeit", "endeDatum", "endeZeit", "start", "ende", "startIso", "endeIso", "ganztaegig",
  "titel", "titelMitKategorie", "verantwortliche", "beschreibung", "kategorieKuerzel", "kategorieName", "ort", "bemerkung",
  "terminId", "fest",
] as const;
export type ExportFeld = (typeof EXPORT_FELDER)[number];
export type ProfilSpalte = { ueberschrift: string; feld: ExportFeld; format?: string | null; wert?: string | null };
export type Kodierung = "utf-8" | "utf-8-bom" | "windows-1252";
export type ExportProfil = {
  id: number; name: string; trennzeichen: string; kodierung: Kodierung; kopfzeile: boolean;
  spalten: ProfilSpalte[]; nurFreigegeben: boolean; kategorien: string[] | null;
};

export const FELD_NAMEN: Record<ExportFeld, string> = {
  startDatum: "Beginn Datum", startZeit: "Beginn Uhrzeit", endeDatum: "Ende Datum", endeZeit: "Ende Uhrzeit",
  start: "Beginn (Datum und Uhrzeit)", ende: "Ende (Datum und Uhrzeit)", startIso: "Beginn ISO 8601", endeIso: "Ende ISO 8601",
  ganztaegig: "Ganztägig (0/1)", titel: "Titel (Themen)", titelMitKategorie: "Titel mit Kategorie („Dienstabend: …“)",
  verantwortliche: "Verantwortliche", beschreibung: "Beschreibung (Themen mit Verantwortlichen, mehrzeilig)",
  kategorieKuerzel: "Kategorie-Kürzel", kategorieName: "Kategorie-Name", ort: "Ort", bemerkung: "Bemerkung",
  terminId: "Termin-id", fest: "Fester Wert",
};

const STANDARD_FORMAT: Partial<Record<ExportFeld, string>> = {
  startDatum: "DD.MM.YYYY", endeDatum: "DD.MM.YYYY", startZeit: "HH:mm", endeZeit: "HH:mm", start: "DD.MM.YYYY HH:mm", ende: "DD.MM.YYYY HH:mm",
};

/**
 * Formatiert Datum/Uhrzeit mit den Platzhaltern YYYY (auch JJJJ), MM, DD (auch
 * TT), HH, mm. Ohne Uhrzeit (ganztägig) endet das Format vor dem ersten HH.
 */
export function formatiere(datum: string, zeit: string | null, format: string): string {
  const [j, m, t] = datum.split("-");
  const [h, mi] = (zeit ?? "").split(":");
  const f = zeit ? format : format.replace(/[\sT]*HH[\s\S]*$/, "");
  if (!/YYYY|JJJJ|MM|DD|TT|HH/.test(f)) return "";
  return f
    .replace(/YYYY|JJJJ/g, j).replace(/DD|TT/g, t).replace(/MM/g, m)
    .replace(/HH/g, h ?? "").replace(/mm/g, mi ?? "");
}

export function feldWert(t: ExportTermin, s: ProfilSpalte): string {
  const f = s.format || STANDARD_FORMAT[s.feld] || "";
  switch (s.feld) {
    case "startDatum": return formatiere(t.startDatum, null, f.replace(/[\sT]*HH.*$/, "") || "DD.MM.YYYY");
    case "endeDatum": return formatiere(t.endeDatum, null, f.replace(/[\sT]*HH.*$/, "") || "DD.MM.YYYY");
    case "startZeit": return t.startZeit ? formatiere(t.startDatum, t.startZeit, f) : "";
    case "endeZeit": return t.endeZeit ? formatiere(t.endeDatum, t.endeZeit, f) : "";
    case "start": return formatiere(t.startDatum, t.startZeit, f);
    case "ende": return formatiere(t.endeDatum, t.endeZeit, f);
    case "startIso": return t.startZeit ? isoMitVersatz(t.startDatum, t.startZeit) : t.startDatum;
    case "endeIso": return t.endeZeit ? isoMitVersatz(t.endeDatum, t.endeZeit) : t.endeDatum;
    case "ganztaegig": return t.ganztaegig ? "1" : "0";
    case "titel": return t.titel;
    case "titelMitKategorie": return t.titel === t.kategorieName ? t.titel : `${t.kategorieName}: ${t.titel}`;
    case "verantwortliche": return t.verantwortliche;
    case "beschreibung": return t.beschreibung;
    case "kategorieKuerzel": return t.kategorieKuerzel;
    case "kategorieName": return t.kategorieName;
    case "ort": return t.ort;
    case "bemerkung": return t.bemerkung;
    case "terminId": return String(t.terminId);
    case "fest": return s.wert ?? "";
  }
}

export function csvFeld(wert: string, trenner: string): string {
  const v = wert.replace(/\r\n|\r/g, "\n");
  return v.includes(trenner) || v.includes('"') || v.includes("\n") || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvZeilen(termine: ExportTermin[], p: Pick<ExportProfil, "spalten" | "trennzeichen" | "kopfzeile">): string {
  const zeilen: string[] = [];
  if (p.kopfzeile) zeilen.push(p.spalten.map((s) => csvFeld(s.ueberschrift, p.trennzeichen)).join(p.trennzeichen));
  for (const t of termine) zeilen.push(p.spalten.map((s) => csvFeld(feldWert(t, s), p.trennzeichen)).join(p.trennzeichen));
  return zeilen.join("\r\n") + "\r\n";
}

const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Text in Bytes der Profil-Kodierung. Zeichen außerhalb von Windows-1252 werden "?". */
export function kodiere(text: string, kodierung: Kodierung): Uint8Array {
  if (kodierung === "windows-1252") {
    const out: number[] = [];
    for (const c of text) {
      const cp = c.codePointAt(0)!;
      if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out.push(cp);
      else out.push(CP1252[c] ?? 0x3f);
    }
    return Uint8Array.from(out);
  }
  const utf8 = new TextEncoder().encode(text);
  if (kodierung === "utf-8") return utf8;
  const mitBom = new Uint8Array(utf8.length + 3);
  mitBom.set([0xef, 0xbb, 0xbf]);
  mitBom.set(utf8, 3);
  return mitBom;
}

/** Prüft ein Profil aus der Verwaltung. */
export function pruefeProfil(b: Record<string, unknown>): { ok: true; daten: Omit<ExportProfil, "id"> } | { ok: false; fehler: string } {
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 80) return { ok: false, fehler: "Name fehlt oder ist zu lang (höchstens 80 Zeichen)" };
  const trennzeichen = b.trennzeichen ?? ";";
  if (trennzeichen !== ";" && trennzeichen !== "," && trennzeichen !== "\t") return { ok: false, fehler: "Trennzeichen muss ; , oder Tab sein" };
  const kodierung = b.kodierung ?? "utf-8-bom";
  if (kodierung !== "utf-8" && kodierung !== "utf-8-bom" && kodierung !== "windows-1252") return { ok: false, fehler: "Kodierung muss utf-8, utf-8-bom oder windows-1252 sein" };
  const kopfzeile = b.kopfzeile ?? true;
  const nurFreigegeben = b.nurFreigegeben ?? true;
  if (typeof kopfzeile !== "boolean" || typeof nurFreigegeben !== "boolean") return { ok: false, fehler: "kopfzeile und nurFreigegeben müssen true oder false sein" };
  let kategorien: string[] | null = null;
  if (b.kategorien !== undefined && b.kategorien !== null) {
    if (!Array.isArray(b.kategorien) || !b.kategorien.every((k) => typeof k === "string" && /^[A-Za-z0-9]{1,5}$/.test(k))) {
      return { ok: false, fehler: "kategorien muss eine Liste von Kürzeln sein" };
    }
    kategorien = b.kategorien.length ? (b.kategorien as string[]).map((k) => k.toUpperCase()) : null;
  }
  if (!Array.isArray(b.spalten) || b.spalten.length === 0 || b.spalten.length > 30) return { ok: false, fehler: "spalten: 1 bis 30 Spalten" };
  const spalten: ProfilSpalte[] = [];
  for (const [i, roh] of (b.spalten as unknown[]).entries()) {
    if (!roh || typeof roh !== "object") return { ok: false, fehler: `Spalte ${i + 1} ungültig` };
    const s = roh as Record<string, unknown>;
    const ueberschrift = typeof s.ueberschrift === "string" ? s.ueberschrift.trim() : "";
    if (kopfzeile && !ueberschrift) return { ok: false, fehler: `Spalte ${i + 1}: Überschrift fehlt` };
    if (ueberschrift.length > 60) return { ok: false, fehler: `Spalte ${i + 1}: Überschrift zu lang` };
    if (!(EXPORT_FELDER as readonly string[]).includes(s.feld as string)) return { ok: false, fehler: `Spalte ${i + 1}: unbekanntes Feld` };
    const format = typeof s.format === "string" && s.format.trim() ? s.format.trim().slice(0, 40) : null;
    if (format && !/^[YJMDTHm.:\-/ T]+$/.test(format)) return { ok: false, fehler: `Spalte ${i + 1}: Format nur aus YYYY, MM, DD, HH, mm und . : - / Leerzeichen` };
    const wert = s.feld === "fest" ? (typeof s.wert === "string" ? s.wert.slice(0, 200) : "") : null;
    spalten.push({ ueberschrift, feld: s.feld as ExportFeld, format, wert });
  }
  return { ok: true, daten: { name, trennzeichen: trennzeichen as string, kodierung: kodierung as Kodierung, kopfzeile, spalten, nurFreigegeben, kategorien } };
}

// ── Änderungsexport (Spec 9.5) ───────────────────────────────────────────────

/** Je exportiertem Termin: Prüfsumme der exportierten Felder und der alte Kopf für die Löschliste. */
export type StandEintrag = { p: string; datum: string; zeit: string | null; titel: string };
export type Stand = Record<string, StandEintrag>;

/** FNV-1a, 32 Bit, hex. Nur zum Erkennen von Änderungen, keine Sicherheit. */
export function pruefsumme(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type Loeschen = { terminId: number; datum: string; zeit: string | null; titel: string; grund: "entfallen" | "geaendert" };

/**
 * Welche Termine sind zu exportieren, welche alten im Zielsystem zu löschen?
 * modus komplett (oder kein früherer Lauf): alle. Änderungen: neue und geänderte;
 * Löschliste = früher exportierte, die geändert wurden oder nicht mehr dabei sind
 * (gelöscht, abgesagt, aus dem Filter gefallen). Bereich = Termine, die dieser
 * Lauf überhaupt betrachtet (Halbjahr); Einträge außerhalb bleiben im Stand.
 */
export function aenderungsExport(
  aktuell: ExportTermin[],
  zeileVon: (t: ExportTermin) => string,
  vorher: Stand | null,
  modus: "komplett" | "aenderungen",
  imBereich: (datum: string) => boolean,
): { exportieren: ExportTermin[]; loeschen: Loeschen[]; stand: Stand } {
  const stand: Stand = {};
  if (vorher) for (const [id, e] of Object.entries(vorher)) if (!imBereich(e.datum)) stand[id] = e;
  const exportieren: ExportTermin[] = [];
  const loeschen: Loeschen[] = [];
  const jetzt = new Set<string>();
  for (const t of aktuell) {
    const p = pruefsumme(zeileVon(t));
    const id = String(t.terminId);
    jetzt.add(id);
    stand[id] = { p, datum: t.startDatum, zeit: t.startZeit, titel: t.titel };
    const alt = vorher?.[id];
    if (modus === "komplett" || !vorher || !alt || alt.p !== p) exportieren.push(t);
    if (modus === "aenderungen" && vorher && alt && alt.p !== p) loeschen.push({ terminId: t.terminId, datum: alt.datum, zeit: alt.zeit, titel: alt.titel, grund: "geaendert" });
  }
  if (modus === "aenderungen" && vorher) {
    for (const [id, e] of Object.entries(vorher)) {
      if (imBereich(e.datum) && !jetzt.has(id)) loeschen.push({ terminId: Number(id), datum: e.datum, zeit: e.zeit, titel: e.titel, grund: "entfallen" });
    }
  }
  loeschen.sort((a, b) => a.datum.localeCompare(b.datum) || a.terminId - b.terminId);
  return { exportieren, loeschen, stand };
}

// ── iCal (Spec 9.4) ──────────────────────────────────────────────────────────

export const ICAL_DOMAIN = "ofwietmarschen.org";
export const icalUid = (terminId: number) => `dienstplan-${terminId}@${ICAL_DOMAIN}`;

export function icalText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Zeilen auf 75 Oktette falten (RFC 5545 3.1), ohne UTF-8-Zeichen zu zerteilen. */
export function falte(zeile: string): string {
  const enc = new TextEncoder();
  if (enc.encode(zeile).length <= 75) return zeile;
  const teile: string[] = [];
  let akt = "";
  let laenge = 0;
  for (const c of zeile) {
    const n = enc.encode(c).length;
    const max = teile.length === 0 ? 75 : 74;
    if (laenge + n > max) { teile.push(akt); akt = ""; laenge = 0; }
    akt += c; laenge += n;
  }
  teile.push(akt);
  return teile.join("\r\n ");
}

/** SEQUENCE: Minuten seit 2020 aus aktualisiert_am. Steigt mit jeder Änderung (Spec 8). */
export function icalSequenz(aktualisiertAm: string): number {
  return Math.max(0, Math.floor((Date.parse(aktualisiertAm) - Date.UTC(2020, 0, 1)) / 60000));
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Berlin", "X-LIC-LOCATION:Europe/Berlin",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

const ical = (d: string, z: string | null) => (z ? `${d.replace(/-/g, "")}T${z.replace(":", "")}00` : d.replace(/-/g, ""));
const naechsterTag = (d: string) => plusMinuten(d, "00:00", 24 * 60).datum;
const stempelUtc = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d+/, "").replace(/Z?$/, "Z");

/**
 * VCALENDAR mit stabilen UIDs (Spec 9.4). Abgesagte Termine stehen mit
 * STATUS:CANCELLED drin (Kalender-Abos entfernen sie dann), Termine ohne Uhrzeit
 * sind ganztägig. DTSTAMP = Erzeugungszeitpunkt.
 */
export function icalKalender(termine: ExportTermin[], o: { name: string; jetzt: string; beschreibung?: string }): string {
  const z: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FW-Hub//Dienstplan//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icalText(o.name)}`, ...(o.beschreibung ? [`X-WR-CALDESC:${icalText(o.beschreibung)}`] : []), "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
    ...VTIMEZONE,
  ];
  for (const t of termine) {
    z.push("BEGIN:VEVENT", `UID:${icalUid(t.terminId)}`, `DTSTAMP:${stempelUtc(o.jetzt)}`, `SEQUENCE:${icalSequenz(t.aktualisiertAm)}`,
      `LAST-MODIFIED:${stempelUtc(t.aktualisiertAm)}`);
    if (t.ganztaegig) {
      z.push(`DTSTART;VALUE=DATE:${ical(t.startDatum, null)}`, `DTEND;VALUE=DATE:${ical(naechsterTag(t.startDatum), null)}`);
    } else {
      z.push(`DTSTART;TZID=Europe/Berlin:${ical(t.startDatum, t.startZeit)}`, `DTEND;TZID=Europe/Berlin:${ical(t.endeDatum, t.endeZeit)}`);
    }
    z.push(`SUMMARY:${icalText(t.ausgefallen ? `Entfällt: ${t.titel}` : t.titel)}`);
    if (t.beschreibung) z.push(`DESCRIPTION:${icalText(t.beschreibung)}`);
    if (t.ort) z.push(`LOCATION:${icalText(t.ort)}`);
    z.push(`CATEGORIES:${icalText(t.kategorieName)}`, `STATUS:${t.ausgefallen ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE", "END:VEVENT");
  }
  z.push("END:VCALENDAR");
  return z.map(falte).join("\r\n") + "\r\n";
}

/** "Stand: 11.11.2026" (Spec 8: Exporte tragen immer den Stand). */
export const standText = (iso: string) => {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  return `Stand: ${f.format(d)}`;
};
