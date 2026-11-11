// CSV-Import von Kameraden (Mitgliederverwaltung, nur globaler Admin).
// Reine Funktionen ohne Imports: scripts/test-mitglieder-import-lib.mjs lädt die
// Datei direkt.
//
// Zwei Formate werden erkannt:
// 1. Tabelle mit Kopfzeile, Spalten in beliebiger Reihenfolge:
//    Nachname;Vorname;Spitzname;Personalnummer (Spitzname und Personalnummer
//    optional, Trennzeichen ; oder ,).
// 2. Anwesenheitsliste aus der Mitgliederverwaltung des Kreises: je Person eine
//    Zeile "lfd. Nr.;;Nachname, Vorname (Personalnummer);;…", davor und danach
//    Kopf- und Summenzeilen, die übersprungen werden.
// Kodierung: UTF-8 (mit oder ohne BOM), sonst Windows-1252 (Excel-Export).

export interface ImportZeile {
  /** Zeilennummer in der Datei (1-basiert). */
  zeile: number;
  nachname: string;
  vorname: string;
  spitzname: string | null;
  personalnummer: string | null;
}

export interface ParseErgebnis {
  format: "tabelle" | "anwesenheitsliste";
  zeilen: ImportZeile[];
  fehler: { zeile: number; text: string }[];
}

export type ImportStatus = "neu" | "pruefen" | "ergaenzen" | "vorhanden" | "konflikt";

export interface Vorhanden {
  id: number;
  name: string;
  vorname: string;
  personalnummer: string | null;
  spitzname: string | null;
  aktiv: boolean;
}

export interface AbgleichZeile extends ImportZeile {
  status: ImportStatus;
  /** Bei ergaenzen/vorhanden/konflikt: der betroffene Kamerad. */
  kameradId: number | null;
  /** Bei ergaenzen: welche leeren Felder gefüllt werden. */
  ergaenzt: ("personalnummer" | "spitzname")[];
  hinweis: string | null;
  /** In der Vorschau angehakt (neu und ergaenzen); pruefen muss man selbst wählen. */
  vorausgewaehlt: boolean;
}

export const MAX_DATEI_BYTES = 512 * 1024;
const MAX = { nachname: 100, vorname: 100, spitzname: 30, personalnummer: 50 };

/** UTF-8 (BOM wird entfernt), bei ungültigem UTF-8 Windows-1252. */
export function dekodiere(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Eine CSV-Zeile mit Anführungszeichen ("" = ein Anführungszeichen). */
export function zerlegeZeile(zeile: string, trenner: string): string[] {
  const zellen: string[] = [];
  let akt = "";
  let inQuote = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (inQuote) {
      if (c === '"' && zeile[i + 1] === '"') { akt += '"'; i++; }
      else if (c === '"') inQuote = false;
      else akt += c;
    } else if (c === '"' && akt.trim() === "") { inQuote = true; akt = ""; }
    else if (c === trenner) { zellen.push(akt.trim()); akt = ""; }
    else akt += c;
  }
  zellen.push(akt.trim());
  return zellen;
}

const KOPF: Record<string, keyof Omit<ImportZeile, "zeile">> = {
  nachname: "nachname", name: "nachname", familienname: "nachname",
  vorname: "vorname",
  spitzname: "spitzname", kuerzel: "spitzname", "kürzel": "spitzname",
  personalnummer: "personalnummer", persnr: "personalnummer", "pers.-nr.": "personalnummer",
  "pers.nr.": "personalnummer", "personal-nr.": "personalnummer", "personalnr.": "personalnummer",
};
const kopfSchluessel = (z: string) => z.toLowerCase().replace(/\s+/g, "");

// "Nachname, Vorname (Personalnummer)". Der Nachname endet am ersten Komma,
// damit "Firma AG (z.Hd. X), Bank (156)" als ein Eintrag erkannt wird.
const LISTEN_EINTRAG = /^(.+?),\s*(.+?)\s*\(([^()]*)\)\s*$/;
const ORGANISATION = /\(|\b(AG|GmbH|KG|e\.\s?V\.|eG|Bank|Stiftung|Versicherung|Finanz\w*)\b/i;

function pruefeFelder(z: ImportZeile): string | null {
  if (!z.nachname) return "Nachname fehlt";
  if (!z.vorname) return "Vorname fehlt";
  for (const f of ["nachname", "vorname", "spitzname", "personalnummer"] as const) {
    const w = z[f];
    if (w && w.length > MAX[f]) return `${f === "nachname" ? "Nachname" : f === "vorname" ? "Vorname" : f === "spitzname" ? "Spitzname" : "Personalnummer"} zu lang (höchstens ${MAX[f]} Zeichen)`;
  }
  return null;
}

const leerZuNull = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Erkennt das Format und liefert die Personenzeilen (noch ohne Abgleich). */
export function parseKameradenCsv(text: string): ParseErgebnis | { fehler: string } {
  const zeilen = text.split(/\r\n|\n|\r/);
  const fehler: ParseErgebnis["fehler"] = [];
  const erste = zeilen.find((z) => z.trim() !== "") ?? "";
  if (!erste) return { fehler: "Die Datei ist leer" };

  // Format 1: Kopfzeile mit Nachname und Vorname in den ersten 10 Zeilen
  for (let k = 0; k < Math.min(zeilen.length, 10); k++) {
    for (const trenner of [";", ",", "\t"]) {
      const kopf = zerlegeZeile(zeilen[k], trenner).map(kopfSchluessel);
      const spalten = kopf.map((z) => KOPF[z] ?? null);
      if (!spalten.includes("nachname") || !spalten.includes("vorname")) continue;
      const ergebnis: ImportZeile[] = [];
      for (let i = k + 1; i < zeilen.length; i++) {
        if (zeilen[i].trim() === "" || zerlegeZeile(zeilen[i], trenner).every((c) => c === "")) continue;
        const zellen = zerlegeZeile(zeilen[i], trenner);
        const roh: Record<string, string> = {};
        spalten.forEach((f, idx) => { if (f && roh[f] === undefined) roh[f] = zellen[idx] ?? ""; });
        const z: ImportZeile = {
          zeile: i + 1,
          nachname: (roh.nachname ?? "").trim(),
          vorname: (roh.vorname ?? "").trim(),
          spitzname: leerZuNull(roh.spitzname),
          personalnummer: leerZuNull(roh.personalnummer),
        };
        const f = pruefeFelder(z);
        if (f) fehler.push({ zeile: z.zeile, text: f });
        else ergebnis.push(z);
      }
      return { format: "tabelle", zeilen: ergebnis, fehler };
    }
  }

  // Format 2: Anwesenheitsliste (erste Zelle laufende Nummer)
  const ergebnis: ImportZeile[] = [];
  zeilen.forEach((roh, i) => {
    const zellen = zerlegeZeile(roh, ";");
    if (!/^\d+$/.test(zellen[0] ?? "")) return;
    const eintrag = zellen.slice(1).find((c) => c !== "");
    if (!eintrag) return;
    const m = LISTEN_EINTRAG.exec(eintrag);
    if (!m) { fehler.push({ zeile: i + 1, text: "Eintrag nicht als „Nachname, Vorname (Personalnummer)“ lesbar" }); return; }
    const z: ImportZeile = {
      zeile: i + 1,
      nachname: m[1].trim(),
      vorname: m[2].trim(),
      spitzname: null,
      personalnummer: leerZuNull(m[3]),
    };
    const f = pruefeFelder(z);
    if (f) fehler.push({ zeile: z.zeile, text: f });
    else ergebnis.push(z);
  });
  if (ergebnis.length === 0 && fehler.length === 0) {
    return { fehler: "Format nicht erkannt. Erwartet: Kopfzeile Nachname;Vorname;Spitzname;Personalnummer oder eine Anwesenheitsliste." };
  }
  return { format: "anwesenheitsliste", zeilen: ergebnis, fehler };
}

const nameSchluessel = (nachname: string, vorname: string) =>
  `${nachname}\u0000${vorname}`.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
/** Personalnummern vergleichen ohne Groß/klein und führende Nullen ("002" = "2"). */
export const pnrSchluessel = (p: string) => {
  const t = p.trim().toLowerCase();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
};

/** Gleicht die Zeilen mit den vorhandenen Kameraden ab. Legt nichts an. */
export function abgleichen(zeilen: ImportZeile[], vorhandene: Vorhanden[]): AbgleichZeile[] {
  const perPnr = new Map<string, Vorhanden>();
  const perName = new Map<string, Vorhanden[]>();
  for (const v of vorhandene) {
    if (v.personalnummer) perPnr.set(pnrSchluessel(v.personalnummer), v);
    const k = nameSchluessel(v.name, v.vorname);
    perName.set(k, [...(perName.get(k) ?? []), v]);
  }
  const dateiPnr = new Map<string, number>();
  const dateiName = new Map<string, number>();
  const zugeordnet = new Map<number, number>(); // kameradId → Zeile
  const ergebnis: AbgleichZeile[] = [];
  const doppeltZugeordnet = (id: number, zeile: number) => {
    const frueher = zugeordnet.get(id);
    if (frueher === undefined) { zugeordnet.set(id, zeile); return null; }
    return frueher;
  };

  for (const z of zeilen) {
    const basis = { ...z, kameradId: null, ergaenzt: [] as AbgleichZeile["ergaenzt"], hinweis: null, vorausgewaehlt: false };
    const nk = nameSchluessel(z.nachname, z.vorname);
    const pk = z.personalnummer ? pnrSchluessel(z.personalnummer) : null;
    const dopplungPnr = pk ? dateiPnr.get(pk) : undefined;
    const dopplungName = dateiName.get(nk);
    if (pk && dopplungPnr === undefined) dateiPnr.set(pk, z.zeile);
    if (dopplungName === undefined) dateiName.set(nk, z.zeile);

    if (dopplungPnr !== undefined) {
      ergebnis.push({ ...basis, status: "konflikt", hinweis: `Personalnummer schon in Zeile ${dopplungPnr}` });
      continue;
    }
    const perNr = pk ? perPnr.get(pk) : undefined;
    if (perNr) {
      if (nameSchluessel(perNr.name, perNr.vorname) !== nk) {
        ergebnis.push({ ...basis, kameradId: perNr.id, status: "konflikt", hinweis: `Personalnummer gehört zu ${perNr.name}, ${perNr.vorname}` });
        continue;
      }
      const frueher = doppeltZugeordnet(perNr.id, z.zeile);
      if (frueher !== null) {
        ergebnis.push({ ...basis, kameradId: perNr.id, status: "konflikt", hinweis: `Kamerad schon in Zeile ${frueher} zugeordnet` });
        continue;
      }
      const ergaenzt: AbgleichZeile["ergaenzt"] = z.spitzname && !perNr.spitzname ? ["spitzname"] : [];
      ergebnis.push({
        ...basis, kameradId: perNr.id, ergaenzt,
        status: ergaenzt.length ? "ergaenzen" : "vorhanden",
        vorausgewaehlt: ergaenzt.length > 0,
        hinweis: perNr.aktiv ? null : "Kamerad ist inaktiv",
      });
      continue;
    }
    const gleicheNamen = perName.get(nk) ?? [];
    if (gleicheNamen.length > 1) {
      ergebnis.push({ ...basis, status: "pruefen", hinweis: `${gleicheNamen.length} Kameraden mit diesem Namen vorhanden` });
      continue;
    }
    if (gleicheNamen.length === 1) {
      const v = gleicheNamen[0];
      if (z.personalnummer && v.personalnummer) {
        // Gleicher Name, andere Personalnummer: zweite Person gleichen Namens oder Tippfehler
        ergebnis.push({ ...basis, status: "pruefen", hinweis: `Gleicher Name mit Personalnummer ${v.personalnummer} vorhanden` });
        continue;
      }
      const frueher = doppeltZugeordnet(v.id, z.zeile);
      if (frueher !== null) {
        ergebnis.push({ ...basis, kameradId: v.id, status: "konflikt", hinweis: `Kamerad schon in Zeile ${frueher} zugeordnet` });
        continue;
      }
      const ergaenzt: AbgleichZeile["ergaenzt"] = [];
      if (z.personalnummer && !v.personalnummer) ergaenzt.push("personalnummer");
      if (z.spitzname && !v.spitzname) ergaenzt.push("spitzname");
      ergebnis.push({
        ...basis, kameradId: v.id, ergaenzt,
        status: ergaenzt.length ? "ergaenzen" : "vorhanden",
        vorausgewaehlt: ergaenzt.length > 0,
        hinweis: v.aktiv ? null : "Kamerad ist inaktiv",
      });
      continue;
    }
    if (dopplungName !== undefined) {
      ergebnis.push({ ...basis, status: "pruefen", hinweis: `Gleicher Name schon in Zeile ${dopplungName}` });
      continue;
    }
    if (ORGANISATION.test(z.nachname) || ORGANISATION.test(z.vorname)) {
      ergebnis.push({ ...basis, status: "pruefen", hinweis: "Sieht nicht nach einer Person aus" });
      continue;
    }
    ergebnis.push({ ...basis, status: "neu", vorausgewaehlt: true });
  }
  return ergebnis;
}

/** Zeilen, die übernommen werden können (anlegen oder ergänzen). */
export const istUebernehmbar = (z: AbgleichZeile) =>
  z.status === "neu" || z.status === "pruefen" || z.status === "ergaenzen";
