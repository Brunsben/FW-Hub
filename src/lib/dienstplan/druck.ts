// Aufbereitung für PDF und Bild (Spec 9.2, 9.3, Phase 11). Reine Funktionen
// ohne Imports (scripts/test-dienstplan-druck-lib.mjs lädt die Datei direkt).

const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const wochentagVon = (datum: string) => {
  const [j, m, t] = datum.split("-").map(Number);
  return TAGE[new Date(Date.UTC(j, m - 1, t)).getUTCDay()];
};
const datumDe = (datum: string) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}`;

export type DruckQuelle = {
  id: number; datum: string; uhrzeit: string | null; kategorieId: number; kuerzel: string; ausgefallen: boolean;
  bemerkung: string | null; ort: string | null;
  themen: { titel: string; kurztitel?: string | null; verantwortliche: { name: string }[] }[];
};
export type DruckKategorie = { id: number; kuerzel: string; name: string; farbe: string; aktiv?: boolean };

export type DruckZeile = {
  terminId: number;
  datum: string;
  /** "12.01.2027" */ datumLang: string;
  /** "12.01." */ datumKurz: string;
  tag: string;
  uhrzeit: string;
  kuerzel: string;
  farbe: string;
  /** Themen mit " / ", ohne Thema der Kategoriename; bei Absage "entfällt …". */
  titel: string;
  /** Wie titel, aber mit Kurztiteln, wo vorhanden (Bild). */
  kurz: string;
  verantwortliche: string;
  ausgefallen: boolean;
};

export function druckZeilen(termine: DruckQuelle[], kategorien: DruckKategorie[], halbjahr: 1 | 2 | null): DruckZeile[] {
  const kat = new Map(kategorien.map((k) => [k.id, k]));
  return termine
    .filter((t) => halbjahr === null || (Number(t.datum.slice(5, 7)) <= 6 ? 1 : 2) === halbjahr)
    .map((t) => {
      const k = kat.get(t.kategorieId);
      const name = k?.name ?? t.kuerzel;
      const titel = t.themen.map((p) => p.titel).join(" / ") || name;
      const kurz = t.themen.map((p) => p.kurztitel || p.titel).join(" / ") || name;
      const absage = (x: string) => `entfällt${t.bemerkung ? `: ${t.bemerkung}` : ""}${x !== name ? ` (${x})` : ""}`;
      return {
        terminId: t.id,
        datum: t.datum,
        datumLang: datumDe(t.datum),
        datumKurz: `${t.datum.slice(8, 10)}.${t.datum.slice(5, 7)}.`,
        tag: wochentagVon(t.datum),
        uhrzeit: t.uhrzeit ?? "",
        kuerzel: t.kuerzel,
        farbe: t.ausgefallen ? "gray" : k?.farbe ?? "gray",
        titel: t.ausgefallen ? absage(titel) : titel + (t.bemerkung ? ` (${t.bemerkung})` : ""),
        kurz: t.ausgefallen ? "entfällt" : kurz,
        verantwortliche: t.ausgefallen ? "" : t.themen.map((p) => p.verantwortliche.map((v) => v.name).join(", ")).filter(Boolean).join(" / "),
        ausgefallen: t.ausgefallen,
      };
    });
}

/** Kategorien für die Legende: nur die, die im Ausschnitt vorkommen, in Katalogreihenfolge. */
export function legende(zeilen: DruckZeile[], kategorien: DruckKategorie[]): DruckKategorie[] {
  const da = new Set(zeilen.filter((z) => !z.ausgefallen).map((z) => z.kuerzel));
  return kategorien.filter((k) => da.has(k.kuerzel));
}

export const titelText = (jahr: number, halbjahr: 1 | 2 | null) => `Dienstplan ${jahr}${halbjahr ? ` – ${halbjahr}. Halbjahr` : ""}`;

// ── Bild für Smartphone (Spec 9.3) ───────────────────────────────────────────

export const BILD = { breite: 1290, hoehe: 2796, oben: 0.15, unten: 0.1 } as const;

/**
 * Zeilenhöhe und Schriftgröße so, dass alle Termine in den freien Bereich
 * (ohne die oberen 15 % und unteren 10 %) passen. Kopf 150 px, Legende 70 px.
 */
export function bildMasse(anzahl: number, mitNamen: boolean): { zeile: number; schrift: number; klein: number } {
  const verfuegbar = BILD.hoehe * (1 - BILD.oben - BILD.unten) - 150 - 70;
  const max = mitNamen ? 96 : 80;
  const zeile = Math.max(24, Math.min(max, Math.floor(verfuegbar / Math.max(1, anzahl))));
  const schrift = Math.max(14, Math.min(40, Math.round(zeile * (mitNamen ? 0.4 : 0.48))));
  return { zeile, schrift, klein: Math.max(11, Math.round(schrift * 0.72)) };
}

/** Kürzt Text auf ungefähr n Zeichen (für eine Zeile im Bild). */
export function kuerze(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, Math.max(1, n - 1)).trimEnd()}…`;
}
