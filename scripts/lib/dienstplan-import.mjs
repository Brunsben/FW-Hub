// Reine Analyse für den Dienstplan-Import (Spec Abschnitt 10). Keine Datenbank,
// kein Dateizugriff: Eingabe sind die gelesenen Excel-Zeilen, die Kameraden aus
// dienstplan.kameraden_namen(), die Kategorien und die manuelle Zuordnung.
// Ausgabe sind die zu schreibenden Termine, der Themenkatalog, Blockvorschläge
// und der Klärungsbericht. Der Runner ist scripts/dienstplan-import.mjs.
//
// Regeln (Spec 10, 0–4):
// - Typ-Kürzel werden groß geschrieben. F = ausgefallener Dienstabend (Kategorie D,
//   ausgefallen, Grund in bemerkung). D ohne Uhrzeit und ohne Ausbilder gilt
//   ebenfalls als ausgefallen (Feiertage im Blatt 2023). Fehlt der Typ, wird er
//   aus dem Titel abgeleitet (Hinweis im Bericht).
// - Themen werden an "/" getrennt, nicht in Klammern und nicht vor "-"
//   ("Einsatzstellenbeleuchtung/-absicherung" bleibt ein Thema). "\" gilt als "/".
// - Ausbilder: Gruppen an "/", innerhalb einer Gruppe Personen an ",", außer es
//   folgt ein Initial ("Name, J." bleibt eine Person). Gruppen sind
//   positionsgleich zu den Themen. Ein Thema: alle Personen daran. Eine Gruppe für
//   mehrere Themen: die Gruppe an jedem Thema. Sonst alle am ersten Thema und ein
//   Hinweis im Bericht.
// - "GF"/"Gruppenführer" → Platzhalter alle_gf, "n.n."/"???" → offen, bekannte
//   Organisationen → externe Person ohne Namen.
// - Personen werden über Nachname, Initiale, Vorname oder Spitzname gegen die
//   Kameraden abgeglichen. Nicht eindeutig zuordenbare Einträge blockieren den
//   Import, bis sie in der Zuordnungsdatei stehen. Der Import legt nie Kameraden an.

export const norm = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
export const vergleich = (s) => norm(s).toLowerCase().replace(/ß/g, "ss");

const PLATZHALTER = new Map([
  ["gf", "alle_gf"], ["gruppenführer", "alle_gf"], ["gruppenfuehrer", "alle_gf"],
  ["n.n.", "offen"], ["n.n", "offen"], ["nn", "offen"], ["?", "offen"], ["??", "offen"], ["???", "offen"],
]);
const ORGANISATIONEN = new Set([
  "drk", "thw", "johanniter", "asb", "malteser", "polizei", "gemeinde", "landkreis", "rettungsdienst",
]);
const ORG_MUSTER = /^(of|ff|fw|ortsfeuerwehr|feuerwehr)\s+\S/;
// Initial nach einem Komma: ein bis drei Buchstaben, Punkt optional ("J.", "I", "Mar.").
const INITIAL = /^[A-ZÄÖÜ][a-zäöü]{0,2}\.?$/;
const K_TITEL = ["weihnachtsfeier", "maifahrt", "kloatsheeten", "feuerwehrfest", "knobeln", "feuerwehrfahrt"];
const STOPPWOERTER = new Set(["und", "der", "die", "das", "mit", "von", "bei", "nach", "im", "in", "den", "dem", "an", "am", "zur", "zum", "p", "t"]);

// ── Zerlegen ────────────────────────────────────────────────────────────────

export function splitThemen(text) {
  const s = norm(text).replace(/\\/g, "/");
  const teile = [];
  let akt = "";
  let tiefe = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") tiefe++;
    else if (c === ")") tiefe = Math.max(0, tiefe - 1);
    if (c === "/" && tiefe === 0 && s[i + 1] !== "-") { teile.push(akt); akt = ""; continue; }
    akt += c;
  }
  teile.push(akt);
  return teile.map(norm).filter((t) => /[\p{L}\p{N}]/u.test(t));
}

/** Gruppen (an "/") mit Personen (an "," ohne folgendes Initial). */
export function splitAusbilder(text) {
  return norm(text).replace(/\\/g, "/").split("/").map(norm).filter(Boolean)
    .map((g) => {
      const personen = [];
      for (const t of g.split(",").map(norm)) {
        if (!t) continue;
        if (personen.length && INITIAL.test(t)) personen[personen.length - 1] += `, ${t}`;
        else personen.push(t);
      }
      return personen;
    })
    .filter((g) => g.length);
}

export function parsePerson(token) {
  const t = norm(token);
  let m = t.match(/^(.+?),\s*([A-Za-zÄÖÜäöü]{1,3})\.?$/);
  if (m) return { name: norm(m[1]), vorPrefix: m[2] };
  m = t.match(/^((?:[A-ZÄÖÜ][a-zäöü]{0,2}\.\s*)+)(\S.*)$/);
  if (m) return { name: norm(m[2]), vorPrefix: m[1].split(".")[0].trim() };
  m = t.match(/^([A-ZÄÖÜ][\p{L}-]+)\s+([\p{L}][\p{L}-]+)$/u);
  if (m) return { name: m[2], vorname: m[1] };
  return { name: t, spitzKandidat: /^[A-ZÄÖÜ]{2,5}$/.test(t) };
}

export function klassifiziere(token) {
  const v = vergleich(token);
  if (PLATZHALTER.has(v)) return { art: "platzhalter", wert: PLATZHALTER.get(v) };
  if (ORGANISATIONEN.has(v) || ORG_MUSTER.test(v)) return { art: "extern", organisation: norm(token), name: null };
  return { art: "person", ...parsePerson(token) };
}

/** Schlüssel einer Person: gleiche Angabe in anderer Schreibweise ("B.Bruns", "B. Bruns") ergibt denselben Schlüssel. */
export function identitaet(token) {
  const k = klassifiziere(token);
  if (k.art !== "person") return vergleich(token);
  return `${vergleich(k.name)}|${vergleich(k.vorPrefix ?? k.vorname ?? "")}`;
}

export function kategorieAusTitel(titel) {
  const v = vergleich(titel);
  if (v.includes("zwischendienst")) return "Z";
  if (v.includes("ortskommando")) return "O";
  if (v.includes("gruppenführer") || /^gf[- ]runde/.test(v) || v.includes("dienstplanerstellung")) return "G";
  if (/\bjhv\b/.test(v) || v.includes("jahreshauptversammlung")) return "J";
  if (K_TITEL.some((k) => v.includes(k))) return "K";
  return "D";
}

// ── Personen ────────────────────────────────────────────────────────────────

/** Kandidaten aus der Kameradenliste (alle, auch inaktive: Altdaten). */
export function findeKameraden(p, kameraden) {
  const name = vergleich(p.name);
  if (!p.vorPrefix && !p.vorname) {
    const spitz = kameraden.filter((k) => k.spitzname && vergleich(k.spitzname) === name);
    if (spitz.length) return spitz;
  }
  let k = kameraden.filter((x) => vergleich(x.name) === name);
  if (p.vorPrefix) { const v = vergleich(p.vorPrefix); k = k.filter((x) => vergleich(x.vorname).startsWith(v)); }
  if (p.vorname) { const v = vergleich(p.vorname); k = k.filter((x) => vergleich(x.vorname).startsWith(v)); }
  return k;
}

const kameradText = (k) => `${k.id}: ${k.name}, ${k.vorname}${k.spitzname ? ` (${k.spitzname})` : ""}${k.aktiv ? "" : " [inaktiv]"}`;

/** Zuordnungswert aus der JSON-Datei in einen Bezug übersetzen. null = nicht gesetzt. */
export function zuordnungsBezug(wert, kameradenById) {
  if (wert == null) return null;
  if (typeof wert === "number" || (typeof wert === "object" && wert.kamerad != null)) {
    const id = typeof wert === "number" ? wert : Number(wert.kamerad);
    if (!kameradenById.has(id)) return { fehler: `Kamerad ${id} gibt es nicht` };
    return { art: "kamerad", kameradId: id };
  }
  if (wert === "alle_gf" || wert === "offen") return { art: "platzhalter", wert };
  if (typeof wert === "object" && wert.extern) {
    const e = wert.extern;
    const name = e.name ? norm(e.name) : null;
    const organisation = e.organisation ? norm(e.organisation) : null;
    if (!name && !organisation) return { fehler: "extern braucht name oder organisation" };
    return { art: "extern", name, organisation, funktion: e.funktion ? norm(e.funktion) : null };
  }
  return { fehler: `unbekannter Zuordnungswert ${JSON.stringify(wert)}` };
}

// ── Analyse ─────────────────────────────────────────────────────────────────

/**
 * @param {object} e
 * @param {Array<{jahr:number, zeile:number, datum:string, typ:string, uhrzeit:string|null, thema:string, ausbilder:string, ort:string}>} e.zeilen
 * @param {string[]} e.gruppenfuehrer  Namen aus dem Blatt "Gruppenführer"
 * @param {Array<{id:number, vorname:string, name:string, spitzname:string|null, aktiv:boolean}>} e.kameraden
 * @param {Array<{id:number, kuerzel:string, name:string}>} e.kategorien
 * @param {{personen?:object, themen?:object, bloecke?:string[][]}} e.zuordnung
 * @param {boolean} e.mehrdeutigErster  nur Testdaten-Modus: mehrdeutige Namen → erster Kandidat
 */
export function analysiere({ zeilen, gruppenfuehrer = [], kameraden, kategorien, zuordnung = {}, mehrdeutigErster = false }) {
  const katByKuerzel = new Map(kategorien.map((k) => [k.kuerzel.toUpperCase(), k]));
  const kameradenById = new Map(kameraden.map((k) => [k.id, k]));
  const zPersonen = new Map(Object.entries(zuordnung.personen ?? {}).map(([k, v]) => [vergleich(k), v]));
  const zThemen = new Map(Object.entries(zuordnung.themen ?? {})
    .filter(([, v]) => v != null && norm(v)).map(([k, v]) => [vergleich(k), norm(v)]));

  const personen = new Map(); // vergleich(token) → Eintrag
  const themen = new Map();   // vergleich(titel) → { varianten: Map<titel, {anzahl, jahr}>, fundstellen, anzahl }
  const terminHinweise = [];
  const termine = [];

  const person = (token, fundstelle) => {
    const key = identitaet(token);
    let p = personen.get(key);
    if (!p) { p = { schreibweisen: new Map(), anzahl: 0, fundstellen: [] }; personen.set(key, p); }
    p.schreibweisen.set(norm(token), (p.schreibweisen.get(norm(token)) ?? 0) + 1);
    p.anzahl++;
    p.fundstellen.push(fundstelle);
    return key;
  };
  const thema = (titel, jahr, fundstelle) => {
    const ziel = zThemen.get(vergleich(titel)) ?? norm(titel);
    const key = vergleich(ziel);
    let t = themen.get(key);
    if (!t) { t = { varianten: new Map(), anzahl: 0, fundstellen: [], zusammengefuehrt: [] }; themen.set(key, t); }
    if (zThemen.has(vergleich(titel)) && vergleich(titel) !== key) t.zusammengefuehrt.push(norm(titel));
    const v = t.varianten.get(ziel) ?? { anzahl: 0, jahr: 0 };
    v.anzahl++; v.jahr = Math.max(v.jahr, jahr);
    t.varianten.set(ziel, v);
    t.anzahl++;
    t.fundstellen.push(fundstelle);
    return key;
  };

  for (const z of zeilen) {
    const fund = `${z.datum || "?"} (${z.jahr}, Zeile ${z.zeile})`;
    const hinweis = (status, text) => terminHinweise.push({ status, schreibweise: `${z.datum} ${norm(z.typ) || "-"} ${norm(z.thema)}`.trim(), fundstelle: fund, text });

    let datum = z.datum;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || "")) { hinweis("fehler", "Datum fehlt oder ist ungültig"); continue; }
    if (Number(datum.slice(0, 4)) !== z.jahr) {
      const neu = `${z.jahr}${datum.slice(4)}`;
      hinweis("hinweis", `Datum liegt nicht im Planjahr ${z.jahr}, übernommen als ${neu}`);
      datum = neu;
    }
    let kuerzel = norm(z.typ).toUpperCase();
    const typAngegeben = Boolean(kuerzel);
    let ausgefallen = false;
    if (!kuerzel) {
      kuerzel = kategorieAusTitel(z.thema);
      hinweis("hinweis", `Typ fehlt, aus dem Titel abgeleitet: ${kuerzel}`);
    }
    if (kuerzel === "F") { kuerzel = "D"; ausgefallen = true; }
    const kat = katByKuerzel.get(kuerzel);
    if (!kat) { hinweis("fehler", `Unbekannter Typ "${norm(z.typ)}"`); continue; }
    const gruppen = splitAusbilder(z.ausbilder);
    if (!ausgefallen && typAngegeben && kuerzel === "D" && !z.uhrzeit && !gruppen.length) {
      ausgefallen = true;
      hinweis("hinweis", "Dienstabend ohne Uhrzeit und Ausbilder, als ausgefallen übernommen");
    }

    const termin = {
      jahr: z.jahr, datum, uhrzeit: z.uhrzeit || null, kategorieId: kat.id, kuerzel,
      ausgefallen, ort: norm(z.ort) || null, bemerkung: ausgefallen ? norm(z.thema) || null : null,
      themen: [], fundstelle: fund,
    };
    termine.push(termin);
    if (ausgefallen) continue;

    let teile = splitThemen(z.thema);
    if (!teile.length && gruppen.length) teile = [kat.name];
    const nurKategorie = teile.length === 1 && vergleich(teile[0]) === vergleich(kat.name);
    if (nurKategorie && !gruppen.length) continue;
    const katalog = (kuerzel === "D" || kuerzel === "Z") && !nurKategorie;

    let zuteilung;
    if (gruppen.length === teile.length) zuteilung = gruppen;
    else if (teile.length === 1) zuteilung = [gruppen.flat()];
    else if (gruppen.length === 0) zuteilung = teile.map(() => []);
    else if (gruppen.length === 1) zuteilung = teile.map(() => gruppen[0]);
    else {
      zuteilung = teile.map((_, i) => (i === 0 ? gruppen.flat() : []));
      hinweis("hinweis", `${teile.length} Themen, ${gruppen.length} Ausbilder-Gruppen: alle Ausbilder am ersten Thema, bitte prüfen`);
    }
    termin.themen = teile.map((titel, i) => ({
      themaKey: katalog ? thema(titel, z.jahr, fund) : null,
      freitext: katalog ? null : titel,
      personen: (zuteilung[i] ?? []).map((t) => person(t, fund)),
    }));
  }

  const ausgleich = gruppenfuehrer.map((name) => person(name, "Blatt Gruppenführer"));

  // Personen auflösen. Häufigste Schreibweise ist die Anzeige; die Zuordnungsdatei
  // darf jede Schreibweise als Schlüssel nutzen, widersprüchliche Einträge sind ein Fehler.
  for (const p of personen.values()) {
    const varianten = [...p.schreibweisen].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
    p.schreibweise = varianten[0][0];
    p.varianten = varianten.slice(1).map(([v]) => v);
    const kl = klassifiziere(p.schreibweise);
    p.klasse = kl;
    const werte = [...p.schreibweisen.keys()].map((v) => zPersonen.get(vergleich(v))).filter((v) => v != null);
    if (new Set(werte.map((v) => JSON.stringify(v))).size > 1) { p.status = "fehler"; p.text = "Zuordnung: Schreibweisen dieser Person sind unterschiedlich zugeordnet"; continue; }
    if (werte.length) {
      const b = zuordnungsBezug(werte[0], kameradenById);
      if (b.fehler) { p.status = "fehler"; p.text = `Zuordnung: ${b.fehler}`; continue; }
      p.bezug = b; p.status = "zugeordnet"; p.quelle = "Zuordnungsdatei";
      continue;
    }
    if (kl.art === "platzhalter") { p.bezug = { art: "platzhalter", wert: kl.wert }; p.status = "zugeordnet"; p.quelle = "Platzhalter"; continue; }
    if (kl.art === "extern") { p.bezug = { art: "extern", name: null, organisation: kl.organisation, funktion: null }; p.status = "zugeordnet"; p.quelle = "Organisation"; continue; }
    const kand = findeKameraden(kl, kameraden);
    p.kandidaten = kand;
    if (kand.length === 1) { p.bezug = { art: "kamerad", kameradId: kand[0].id }; p.status = "zugeordnet"; p.quelle = "Abgleich"; }
    else if (kand.length === 0) p.status = "unbekannt";
    else if (mehrdeutigErster) { p.bezug = { art: "kamerad", kameradId: kand[0].id }; p.status = "zugeordnet"; p.quelle = "Testdaten: erster von mehreren Kandidaten"; }
    else p.status = "mehrdeutig";
  }

  // Themen: Anzeigetitel = häufigste Schreibweise, bei Gleichstand die jüngste
  for (const t of themen.values()) {
    const [titel] = [...t.varianten].sort((a, b) => b[1].anzahl - a[1].anzahl || b[1].jahr - a[1].jahr);
    t.titel = titel[0];
  }

  // Themenvorschläge: gleiche Wortmenge oder eine Wortmenge enthält die andere
  const woerter = (s) => new Set(vergleich(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOPPWOERTER.has(w)));
  const liste = [...themen.entries()];
  const themenVorschlaege = [];
  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      const [ka, a] = liste[i]; const [kb, b] = liste[j];
      const wa = woerter(a.titel), wb = woerter(b.titel);
      if (!wa.size || !wb.size) continue;
      const [klein, gross] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
      const enthalten = [...klein].every((w) => gross.has(w));
      const erstesGleich = [...wa][0] === [...wb][0];
      if (!enthalten || !erstesGleich) continue;
      const [von, nach] = a.anzahl < b.anzahl || (a.anzahl === b.anzahl && wa.size > wb.size) ? [ka, kb] : [kb, ka];
      themenVorschlaege.push({ von: themen.get(von).titel, nach: themen.get(nach).titel, grund: wa.size === wb.size ? "gleiche Wörter" : "ein Titel enthält den anderen" });
    }
  }

  // Blöcke: gleiche Themenmenge (≥ 2) an mindestens zwei Terminen
  const bloeckeMap = new Map();
  for (const t of termine) {
    const keys = t.themen.filter((x) => x.themaKey).map((x) => x.themaKey);
    if (keys.length < 2) continue;
    const k = [...new Set(keys)].sort().join("|");
    let b = bloeckeMap.get(k);
    if (!b) { b = { keys, anzahl: 0, fundstellen: [], datum: "" }; bloeckeMap.set(k, b); }
    b.anzahl++; b.fundstellen.push(t.fundstelle);
    if (t.datum > b.datum) { b.datum = t.datum; b.keys = keys; } // Reihenfolge des jüngsten Vorkommens
  }
  const bestaetigt = new Map();
  for (const titelListe of zuordnung.bloecke ?? []) {
    const keys = titelListe.map((x) => vergleich(zThemen.get(vergleich(x)) ?? x));
    const fehlend = keys.filter((k) => !themen.has(k));
    const k = [...new Set(keys)].sort().join("|");
    bestaetigt.set(k, { keys, fehlend: fehlend.length ? titelListe : null });
  }
  const bloecke = [...bloeckeMap.entries()]
    .filter(([k, b]) => b.anzahl >= 2 || bestaetigt.has(k))
    .map(([k, b]) => ({ key: k, name: b.keys.map((x) => themen.get(x).titel).join(" / "), keys: b.keys, anzahl: b.anzahl, fundstellen: b.fundstellen, bestaetigt: bestaetigt.has(k) }));
  for (const [k, b] of bestaetigt) {
    if (b.fehlend) { terminHinweise.push({ status: "fehler", schreibweise: b.fehlend.join(" / "), fundstelle: "Zuordnungsdatei", text: "Block enthält ein Thema, das im Import nicht vorkommt" }); continue; }
    if (!bloecke.some((x) => x.key === k)) bloecke.push({ key: k, name: b.keys.map((x) => themen.get(x).titel).join(" / "), keys: b.keys, anzahl: 0, fundstellen: [], bestaetigt: true });
  }
  for (const t of termine) {
    const keys = t.themen.filter((x) => x.themaKey).map((x) => x.themaKey);
    const k = [...new Set(keys)].sort().join("|");
    t.blockKey = keys.length >= 2 && bestaetigt.has(k) ? k : null;
  }

  const blockierend = [...personen.values()].filter((p) => p.status !== "zugeordnet").length
    + terminHinweise.filter((h) => h.status === "fehler").length;

  return { termine, personen, themen, themenVorschlaege, bloecke, terminHinweise, ausgleich, blockierend };
}

// ── Bericht ─────────────────────────────────────────────────────────────────

const fundText = (f) => (f.length > 5 ? `${f.slice(0, 5).join("; ")}; … (${f.length})` : f.join("; "));

function bezugText(b) {
  if (!b) return "";
  if (b.art === "kamerad") return `Kamerad ${b.kameradId}`;
  if (b.art === "platzhalter") return `Platzhalter ${b.wert}`;
  return `extern: ${[b.organisation, b.name].filter(Boolean).join(" / ")}`;
}

/** Zeilen des Klärungsberichts (CSV). Spalten siehe BERICHT_SPALTEN. */
export const BERICHT_SPALTEN = ["art", "status", "schreibweise", "anzahl", "fundstellen", "vorschlag", "kandidaten"];

export function berichtZeilen(a, kameraden) {
  const byId = new Map(kameraden.map((k) => [k.id, k]));
  const zeilen = [];
  for (const h of a.terminHinweise) zeilen.push({ art: "termin", status: h.status, schreibweise: h.schreibweise, anzahl: 1, fundstellen: h.fundstelle, vorschlag: h.text, kandidaten: "" });
  const reihenfolge = { fehler: 0, unbekannt: 1, mehrdeutig: 2, zugeordnet: 3 };
  for (const p of [...a.personen.values()].sort((x, y) => reihenfolge[x.status] - reihenfolge[y.status] || x.schreibweise.localeCompare(y.schreibweise, "de"))) {
    const kand = p.bezug?.art === "kamerad" ? [byId.get(p.bezug.kameradId)] : p.kandidaten ?? [];
    zeilen.push({
      art: "person", status: p.status, schreibweise: p.varianten.length ? `${p.schreibweise} (auch: ${p.varianten.join(" | ")})` : p.schreibweise,
      anzahl: p.anzahl, fundstellen: fundText(p.fundstellen),
      vorschlag: p.status === "zugeordnet" ? `${bezugText(p.bezug)} (${p.quelle})` : p.text ?? (p.status === "mehrdeutig" ? "Kamerad in der Zuordnungsdatei festlegen" : "Kamerad, externe Person oder Spitzname klären"),
      kandidaten: kand.filter(Boolean).map(kameradText).join(" | "),
    });
  }
  for (const v of a.themenVorschlaege) zeilen.push({ art: "thema", status: "vorschlag", schreibweise: v.von, anzahl: a.themen.get(vergleich(v.von)).anzahl, fundstellen: "", vorschlag: `zusammenführen mit "${v.nach}" (${v.grund})`, kandidaten: "" });
  for (const t of [...a.themen.values()].sort((x, y) => x.titel.localeCompare(y.titel, "de"))) {
    zeilen.push({
      art: "thema", status: "katalog", schreibweise: t.titel, anzahl: t.anzahl, fundstellen: fundText(t.fundstellen),
      vorschlag: t.zusammengefuehrt.length ? `zusammengeführt: ${[...new Set(t.zusammengefuehrt)].join(" | ")}` : "",
      kandidaten: t.varianten.size > 1 ? [...t.varianten].map(([n, v]) => `${n} (${v.anzahl})`).join(" | ") : "",
    });
  }
  for (const b of a.bloecke) zeilen.push({ art: "block", status: b.bestaetigt ? "bestaetigt" : "vorschlag", schreibweise: b.name, anzahl: b.anzahl, fundstellen: fundText(b.fundstellen), vorschlag: b.bestaetigt ? "" : "zur Bestätigung in zuordnung.json unter bloecke eintragen", kandidaten: "" });
  return zeilen;
}

export function csv(zeilen, spalten = BERICHT_SPALTEN) {
  const feld = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [spalten.join(";"), ...zeilen.map((z) => spalten.map((s) => feld(z[s])).join(";"))].join("\r\n") + "\r\n";
}

/** Vorlage für data/import/zuordnung.json: bestehende Einträge bleiben, offene kommen mit null dazu. */
export function zuordnungsVorlage(a, bisher = {}) {
  const personen = { ...(bisher.personen ?? {}) };
  const vorhanden = new Set(Object.keys(personen).map(vergleich));
  for (const p of a.personen.values()) {
    if (p.status !== "zugeordnet" && ![p.schreibweise, ...p.varianten].some((v) => vorhanden.has(vergleich(v)))) personen[p.schreibweise] = null;
  }
  const themenVorschlaege = {};
  for (const v of a.themenVorschlaege) themenVorschlaege[v.von] = v.nach;
  return {
    _hinweis: "Personen: Kamerad-ID (Zahl), \"alle_gf\", \"offen\" oder {\"extern\": {\"organisation\": \"…\", \"name\": \"…\"}}. " +
      "themen und bloecke wirken, *_vorschlaege nicht: bestätigte Einträge von dort nach themen bzw. bloecke übernehmen.",
    personen,
    themen: { ...(bisher.themen ?? {}) },
    themen_vorschlaege: themenVorschlaege,
    bloecke: [...(bisher.bloecke ?? [])],
    bloecke_vorschlaege: a.bloecke.filter((b) => !b.bestaetigt).map((b) => b.keys.map((k) => a.themen.get(k).titel)),
  };
}
