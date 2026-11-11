// Analyse-Regeln des Dienstplan-Imports (scripts/lib/dienstplan-import.mjs), ohne
// Datenbank und ohne Excel. Erfundene Namen, keine Daten aus data/import/.
// Aufruf: node scripts/test-dienstplan-import-lib.mjs
import {
  analysiere, berichtZeilen, csv, findeKameraden, identitaet, kategorieAusTitel, klassifiziere,
  parsePerson, splitAusbilder, splitThemen, zuordnungsVorlage,
} from "./lib/dienstplan-import.mjs";

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};
const gleich = (name, ist, soll) => check(name, JSON.stringify(ist) === JSON.stringify(soll), `ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`);

// ── Zerlegen ──
gleich("Themen an /", splitThemen("AT / ELW-Gruppe / FwDv3 / Maschinisten "), ["AT", "ELW-Gruppe", "FwDv3", "Maschinisten"]);
gleich("/- trennt nicht", splitThemen("Einsatzstellenbeleuchtung/-absicherung"), ["Einsatzstellenbeleuchtung/-absicherung"]);
gleich("/ in Klammern trennt nicht", splitThemen("Moorbegehung (Fahrwege / Laufwege/...)"), ["Moorbegehung (Fahrwege / Laufwege/...)"]);
gleich("Backslash gilt als /", splitThemen("Gruppenführerrunde\\Dienstplanerstellung"), ["Gruppenführerrunde", "Dienstplanerstellung"]);
gleich("leere und Satzzeichen-Teile fallen weg", splitThemen("WBK / Lüfter / / …"), ["WBK", "Lüfter"]);
gleich("Komma im Thema trennt nicht", splitThemen("Pumpenkunde, Wasserförderung"), ["Pumpenkunde, Wasserförderung"]);

gleich("Ausbilder: Gruppen an /", splitAusbilder("Alpha / Beta/ Gamma"), [["Alpha"], ["Beta"], ["Gamma"]]);
gleich("Ausbilder: Komma vor Initial bleibt", splitAusbilder("Alpha, J. / Beta, I / Gamma,T."), [["Alpha, J."], ["Beta, I"], ["Gamma, T."]]);
gleich("Ausbilder: Komma vor Namen trennt", splitAusbilder("Alpha, Beta, Gamma"), [["Alpha", "Beta", "Gamma"]]);
gleich("Ausbilder: Vornamen-Präfix bleibt", splitAusbilder("Alpha, Mar. / Beta"), [["Alpha, Mar."], ["Beta"]]);
gleich("Ausbilder leer", splitAusbilder(""), []);

gleich("Person Nachname, Initial", parsePerson("Alpha, J."), { name: "Alpha", vorPrefix: "J" });
gleich("Person Initial Nachname", parsePerson("K.D. Beta"), { name: "Beta", vorPrefix: "K" });
gleich("Person Initial ohne Leerzeichen", parsePerson("M.Gamma"), { name: "Gamma", vorPrefix: "M" });
gleich("Person Vorname Nachname", parsePerson("Frida Delta"), { name: "Delta", vorname: "Frida" });
gleich("Person nur Nachname", parsePerson("Epsilon"), { name: "Epsilon", spitzKandidat: false });
gleich("Person Kürzel = Spitzname-Kandidat", parsePerson("XYZ"), { name: "XYZ", spitzKandidat: true });

gleich("GF → alle_gf", klassifiziere("GF"), { art: "platzhalter", wert: "alle_gf" });
gleich("Gruppenführer → alle_gf", klassifiziere("Gruppenführer"), { art: "platzhalter", wert: "alle_gf" });
gleich("n.n. → offen", klassifiziere("n.n."), { art: "platzhalter", wert: "offen" });
gleich("??? → offen", klassifiziere("???"), { art: "platzhalter", wert: "offen" });
gleich("DRK → extern", klassifiziere("DRK"), { art: "extern", organisation: "DRK", name: null });
gleich("OF Ort → extern", klassifiziere("OF Nachbarort"), { art: "extern", organisation: "OF Nachbarort", name: null });

check("Identität: B.Alpha = B. Alpha", identitaet("B.Alpha") === identitaet("B. Alpha"));
check("Identität: Alpha, I = I. Alpha = Alpha, I.", identitaet("Alpha, I") === identitaet("I. Alpha") && identitaet("Alpha, I.") === identitaet("I. Alpha"));
check("Identität: ß = ss", identitaet("Weißer") === identitaet("Weisser"));
check("Identität: Alpha ≠ Alpha, I", identitaet("Alpha") !== identitaet("Alpha, I"));

gleich("Kategorie aus Titel", ["Zwischendienst", "Ortskommando", "GF-Runde Begehung", "JHV Gemeinde", "Weihnachtsfeier", "Kreisübung"].map(kategorieAusTitel), ["Z", "O", "G", "J", "K", "D"]);

// ── Abgleich ──
const K = [
  { id: 1, name: "Alpha", vorname: "Jana", spitzname: null, aktiv: true },
  { id: 2, name: "Beta", vorname: "Ines", spitzname: null, aktiv: true },
  { id: 3, name: "Beta", vorname: "Tom", spitzname: null, aktiv: false },
  { id: 4, name: "Gamma", vorname: "Markus", spitzname: "XYZ", aktiv: true },
  { id: 5, name: "Gamma", vorname: "Mathis", spitzname: null, aktiv: true },
  { id: 6, name: "Weißer", vorname: "Paul", spitzname: null, aktiv: true },
];
const ids = (p) => findeKameraden(parsePerson(p), K).map((k) => k.id);
gleich("Abgleich Nachname eindeutig", ids("Alpha"), [1]);
gleich("Abgleich Nachname mehrdeutig (auch inaktive)", ids("Beta"), [2, 3]);
gleich("Abgleich mit Initial", ids("Beta, T."), [3]);
gleich("Abgleich mit Präfix Mar.", ids("Gamma, Mar."), [4]);
gleich("Abgleich mit Präfix M (mehrdeutig)", ids("M. Gamma"), [4, 5]);
gleich("Abgleich Spitzname", ids("XYZ"), [4]);
gleich("Abgleich ss/ß", ids("Weisser"), [6]);
gleich("Abgleich Vorname", ids("Ines Beta"), [2]);
gleich("Abgleich unbekannt", ids("Omega"), []);

// ── Analyse ──
const KAT = [
  { id: 11, kuerzel: "D", name: "Dienstabend" }, { id: 12, kuerzel: "Z", name: "Zwischendienst" },
  { id: 13, kuerzel: "G", name: "Gruppenführerrunde" }, { id: 16, kuerzel: "K", name: "Kameradschaft" },
];
let nr = 1;
const Z = (datum, typ, uhrzeit, thema, ausbilder = "", ort = "") => ({ jahr: 2090, zeile: ++nr, datum, typ, uhrzeit, thema, ausbilder, ort });
const zeilen = [
  Z("2090-01-02", "D", "19:30", "Knoten / Leitern / Funk", "Alpha, J. / Beta, I / XYZ"),        // positionsgleich
  Z("2090-01-09", "z", "19:30", "Zwischendienst"),                                              // nur Kategorie → kein Thema
  Z("2090-01-16", "D", "19:30", "Knoten / Leitern / Funk", "OF Nachbarort"),                     // eine Gruppe → an jedem Thema
  Z("2090-01-23", "D", "19:30", "Pumpen", "Alpha / n.n. / DRK"),                                 // ein Thema, alle Personen
  Z("2090-01-30", "D", "19:30", "Leitern / Knoten / Funk", "Alpha, J. / Beta / Omega / Gamma"),  // 3 Themen, 4 Gruppen → Hinweis
  Z("2090-02-06", "F", null, "Heiligabend"),                                                    // F → ausgefallen
  Z("2090-02-13", "D", null, "Feiertag"),                                                       // D ohne Zeit/Ausbilder → ausgefallen
  Z("2090-02-20", "", null, "Kreisübung"),                                                      // ohne Typ → D, nicht ausgefallen
  Z("2089-02-27", "G", "19:30", "Gruppenführerrunde", "GF", "Halle"),                            // Jahr korrigiert, Freitext, Ort
  Z("2090-03-06", "X", "19:30", "Unbekannt"),                                                   // unbekannter Typ → Fehler
  Z("2090-03-13", "K", "14:00", "Grillen"),                                                     // Freitext ohne Personen
  Z("2090-03-20", "D", "19:30", "knoten"),                                                      // Schreibvariante von Knoten
  Z("2090-03-27", "D", "19:30", "Knoten-Übung"),                                               // Vorschlag zum Zusammenführen
];
const a = analysiere({ zeilen, gruppenfuehrer: ["Alpha, J.", "Gamma, Mar"], kameraden: K, kategorien: KAT, zuordnung: {} });
const t = (datum) => a.termine.find((x) => x.datum === datum);
const tp = (datum, i) => t(datum).themen[i].personen.map((k) => a.personen.get(k).schreibweise);

check("Unbekannter Typ wird nicht übernommen", !a.termine.some((x) => x.fundstelle.includes("Zeile 11")) && a.terminHinweise.some((h) => h.status === "fehler" && h.text.includes("Unbekannter Typ")));
gleich("Positionsgleiche Zuordnung", [tp("2090-01-02", 0), tp("2090-01-02", 1), tp("2090-01-02", 2)], [["Alpha, J."], ["Beta, I"], ["XYZ"]]);
check("Zwischendienst ohne Thema", t("2090-01-09").themen.length === 0 && t("2090-01-09").kuerzel === "Z");
gleich("Eine Gruppe an jedem Thema", t("2090-01-16").themen.map((x) => x.personen.length), [1, 1, 1]);
gleich("Ein Thema, alle Personen", tp("2090-01-23", 0), ["Alpha", "n.n.", "DRK"]);
gleich("Ungleiche Anzahl: alle am ersten Thema", t("2090-01-30").themen.map((x) => x.personen.length), [4, 0, 0]);
check("Ungleiche Anzahl erzeugt Hinweis", a.terminHinweise.some((h) => h.status === "hinweis" && h.fundstelle.startsWith("2090-01-30")));
check("F → D, ausgefallen, Grund in bemerkung, keine Themen", t("2090-02-06").kuerzel === "D" && t("2090-02-06").ausgefallen && t("2090-02-06").bemerkung === "Heiligabend" && !t("2090-02-06").themen.length);
check("D ohne Uhrzeit und Ausbilder → ausgefallen", t("2090-02-13").ausgefallen);
check("Ohne Typ → abgeleitet, nicht ausgefallen", t("2090-02-20").kuerzel === "D" && !t("2090-02-20").ausgefallen && a.terminHinweise.some((h) => h.text.includes("Typ fehlt")));
check("Datum außerhalb des Planjahrs korrigiert", t("2090-02-27") && a.terminHinweise.some((h) => h.text.includes("übernommen als 2090-02-27")));
check("G: Freitext statt Katalog, Ort übernommen", t("2090-02-27").themen[0].freitext === "Gruppenführerrunde" && t("2090-02-27").themen[0].themaKey === null && t("2090-02-27").ort === "Halle");
check("K ohne Personen: Freitext-Thema", t("2090-03-13").themen[0].freitext === "Grillen");
check("Schreibvarianten (Groß/klein) ergeben ein Katalogthema", a.themen.get("knoten").anzahl === 4 && a.themen.get("knoten").titel === "Knoten");
check("Vorschlag zum Zusammenführen", a.themenVorschlaege.some((v) => v.von === "Knoten-Übung" && v.nach === "Knoten"));
check("Blockvorschlag (gleiche Themenmenge, 3×)", a.bloecke.length === 1 && a.bloecke[0].anzahl === 3 && !a.bloecke[0].bestaetigt && a.bloecke[0].name === "Leitern / Knoten / Funk");
check("Ohne Bestätigung kein Block am Termin", a.termine.every((x) => x.blockKey === null));

const st = (s) => a.personen.get(identitaet(s))?.status;
check("Personen: zugeordnet / mehrdeutig / unbekannt", st("Alpha, J.") === "zugeordnet" && st("Beta") === "mehrdeutig" && st("Omega") === "unbekannt" && st("XYZ") === "zugeordnet");
check("Platzhalter und Organisationen sind zugeordnet", st("GF") === "zugeordnet" && st("n.n.") === "zugeordnet" && st("DRK") === "zugeordnet" && st("OF Nachbarort") === "zugeordnet");
check("Blatt Gruppenführer: Personen im Abgleich", a.ausgleich.length === 2 && a.personen.get(a.ausgleich[1]).bezug?.kameradId === 4);
check("Blockierend: Fehler + offene Personen", a.blockierend === 4 /* Typ X, Beta und Gamma mehrdeutig, Omega unbekannt */, String(a.blockierend));

// Zuordnungsdatei
const zu = {
  personen: { "Beta": 2, "Gamma": 5, "omega": { extern: { organisation: "Nachbarverein", name: "Frau Omega" } } },
  themen: { "Knoten-Übung": "Knoten" },
  bloecke: [["Leitern", "Knoten", "Funk"]],
};
const b = analysiere({ zeilen: zeilen.filter((z) => z.typ !== "X"), gruppenfuehrer: [], kameraden: K, kategorien: KAT, zuordnung: zu });
check("Zuordnung Kamerad (Schlüssel ohne Groß/klein)", b.personen.get(identitaet("Beta")).bezug?.kameradId === 2 && b.personen.get(identitaet("Beta")).quelle === "Zuordnungsdatei");
gleich("Zuordnung extern", b.personen.get(identitaet("Omega")).bezug, { art: "extern", name: "Frau Omega", organisation: "Nachbarverein", funktion: null });
check("Themen zusammengeführt", b.themen.get("knoten").anzahl === 5 && !b.themen.has("knoten-übung"));
check("Bestätigter Block hängt an den Terminen", b.bloecke.some((x) => x.bestaetigt) && b.termine.filter((x) => x.blockKey).length === 3);
check("Nichts blockiert mehr", b.blockierend === 0, String(b.blockierend));

const c = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "X", "B. Alpha / B.Alpha")], kameraden: K, kategorien: KAT, zuordnung: { personen: { "B. Alpha": 1, "B.Alpha": 2 } } });
check("Widersprüchliche Zuordnung von Schreibvarianten → Fehler", [...c.personen.values()][0].status === "fehler");
const d = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "X", "Alpha")], kameraden: K, kategorien: KAT, zuordnung: { personen: { Alpha: 99 } } });
check("Zuordnung auf nicht vorhandenen Kameraden → Fehler", [...d.personen.values()][0].status === "fehler");
const e = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "X", "Beta")], kameraden: K, kategorien: KAT, mehrdeutigErster: true });
check("Testdaten-Option: mehrdeutig → erster Kandidat", [...e.personen.values()][0].bezug?.kameradId === 2);

// Bericht und Vorlage
const zeilenBericht = berichtZeilen(a, K);
check("Bericht enthält offene Personen mit Kandidaten", zeilenBericht.some((z) => z.art === "person" && z.status === "mehrdeutig" && z.kandidaten.includes("3: Beta, Tom [inaktiv]")));
check("Bericht enthält Termin-Fehler und Blockvorschlag", zeilenBericht.some((z) => z.art === "termin" && z.status === "fehler") && zeilenBericht.some((z) => z.art === "block"));
const text = csv([{ art: "a;b", status: 'x"y', schreibweise: "z" }]);
check("CSV: BOM, Semikolon, Quoting", text.startsWith("﻿art;status;") && text.includes('"a;b";"x""y";z'));
const v = zuordnungsVorlage(a, { personen: { Omega: 5 } });
check("Vorlage: offene Personen mit null, vorhandene bleiben", v.personen.Beta === null && v.personen.Omega === 5 && !("Alpha, J." in v.personen));
check("Vorlage: Vorschläge getrennt von wirksamen Einträgen", v.themen_vorschlaege["Knoten-Übung"] === "Knoten" && Object.keys(v.themen).length === 0 && v.bloecke.length === 0 && v.bloecke_vorschlaege.length === 1);

console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
