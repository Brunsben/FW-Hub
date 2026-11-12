// Analyse-Regeln des Dienstplan-Imports (scripts/lib/dienstplan-import.mjs), ohne
// Datenbank und ohne Excel. Erfundene Namen, keine Daten aus data/import/.
// Aufruf: node scripts/test-dienstplan-import-lib.mjs
import {
  analysiere, berichtZeilen, csv, einzelTitel, erkenneBlock, findeKameraden, identitaet, kategorieAusTitel,
  klassifiziere, parsePerson, splitAusbilder, splitThemen, STANDARD_BLOECKE, zuordnungsVorlage,
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

// ── Blockerkennung ──
const AT = STANDARD_BLOECKE[0];
gleich("Standardblock", AT, ["AT", "ELW-Gruppe", "FwDv3", "Maschinisten"]);
gleich("Block exakt", erkenneBlock(splitThemen("AT / ELW-Gruppe / FwDv3 / Maschinisten "), [AT])?.titel, AT);
gleich("Block in anderer Reihenfolge", erkenneBlock(splitThemen("AT / Maschinisten / ELW-Gruppe / FwDv3"), [AT])?.titel, ["AT", "Maschinisten", "ELW-Gruppe", "FwDv3"]);
gleich("Block mit Schreibvariante", erkenneBlock(splitThemen("AT-Unterweisung / ELW-Gruppe / FwDv3 / Maschinisten"), [AT])?.titel, AT);
check("Kein Block bei anderer Teilezahl", erkenneBlock(splitThemen("AT / Pumpenkunde"), [AT]) === null);
check("Kein Block bei fremdem Teil", erkenneBlock(splitThemen("AT / ELW-Gruppe / FwDv3 / Funk"), [AT]) === null);
check("Kein Block bei einem Teil", erkenneBlock(["AT"], [AT]) === null);
gleich("Ganzer Titel ohne Rand-Schrägstriche", einzelTitel("WBK / Lüfter / "), "WBK / Lüfter");

// ── Analyse ──
const KAT = [
  { id: 11, kuerzel: "D", name: "Dienstabend" }, { id: 12, kuerzel: "Z", name: "Zwischendienst" },
  { id: 13, kuerzel: "G", name: "Gruppenführerrunde" }, { id: 16, kuerzel: "K", name: "Kameradschaft" },
];
let nr = 1;
const Z = (datum, typ, uhrzeit, thema, ausbilder = "", ort = "") => ({ jahr: 2090, zeile: ++nr, datum, typ, uhrzeit, thema, ausbilder, ort });
const zeilen = [
  Z("2090-01-02", "D", "19:30", "AT / ELW-Gruppe / FwDv3 / Maschinisten", "Alpha, J. / Beta, I / XYZ / Ort Nord"), // Block positionsgleich
  Z("2090-01-09", "z", "19:30", "Zwischendienst"),                                              // nur Kategorie → kein Thema
  Z("2090-01-16", "D", "19:30", "AT-Unterweisung / Maschinisten / ELW-Gruppe / FwDv3", "OF Nachbarort"), // Variante, eine Gruppe → jedes Thema
  Z("2090-01-23", "D", "19:30", "Pumpen", "Alpha / n.n. / DRK"),                                 // ein Thema, alle Personen
  Z("2090-01-30", "D", "19:30", "AT / ELW-Gruppe / FwDv3 / Maschinisten", "Alpha, J. / Beta, I"), // Block, 2 Gruppen → Hinweis
  Z("2090-02-06", "F", null, "Heiligabend"),                                                    // F → ausgefallen
  Z("2090-02-13", "D", null, "Feiertag"),                                                       // D ohne Zeit/Ausbilder → ausgefallen
  Z("2090-02-20", "", null, "Kreisübung"),                                                      // ohne Typ → D, nicht ausgefallen
  Z("2089-02-27", "G", "19:30", "Gruppenführerrunde", "GF", "Halle"),                            // Jahr korrigiert, Freitext, Ort
  Z("2090-03-06", "X", "19:30", "Unbekannt"),                                                   // unbekannter Typ → Fehler
  Z("2090-03-13", "K", "14:00", "Grillen"),                                                     // Freitext ohne Personen
  Z("2090-03-20", "D", "19:30", "Knoten / Leitern", "Alpha / Beta, I"),                          // kein Block: ein Thema
  Z("2090-03-27", "D", "19:30", "knoten / leitern", "Gamma"),                                    // Schreibvariante, wiederholt
  Z("2090-04-03", "D", "19:30", "Knoten-Übung / Leitern"),                                       // Vorschlag zum Zusammenführen
];
const a = analysiere({ zeilen, gruppenfuehrer: ["Alpha, J.", "Gamma, Mar"], kameraden: K, kategorien: KAT, zuordnung: {} });
const t = (datum) => a.termine.find((x) => x.datum === datum);
const tp = (datum, i) => t(datum).themen[i].personen.map((k) => a.personen.get(k).schreibweise);

check("Unbekannter Typ wird nicht übernommen", !a.termine.some((x) => x.fundstelle.includes("Zeile 11")) && a.terminHinweise.some((h) => h.status === "fehler" && h.text.includes("Unbekannter Typ")));
gleich("Block: Themen und Ausbilder positionsgleich", t("2090-01-02").themen.map((x, i) => [a.themen.get(x.themaKey).titel, tp("2090-01-02", i)]),
  [["AT", ["Alpha, J."]], ["ELW-Gruppe", ["Beta, I"]], ["FwDv3", ["XYZ"]], ["Maschinisten", ["Ort Nord"]]]);
check("Block am Termin vermerkt", t("2090-01-02").blockKey !== null && t("2090-01-16").blockKey === t("2090-01-02").blockKey);
check("Zwischendienst ohne Thema", t("2090-01-09").themen.length === 0 && t("2090-01-09").kuerzel === "Z");
gleich("Blockvariante: Reihenfolge des Titels, Variante wird Blockthema, eine Gruppe an jedem Thema",
  t("2090-01-16").themen.map((x) => [a.themen.get(x.themaKey).titel, x.personen.length]), [["AT", 1], ["Maschinisten", 1], ["ELW-Gruppe", 1], ["FwDv3", 1]]);
check("Variante nicht als eigenes Katalogthema", !a.themen.has("at-unterweisung") && a.themen.get("at").anzahl === 3);
gleich("Ein Thema, alle Personen", tp("2090-01-23", 0), ["Alpha", "n.n.", "DRK"]);
gleich("Block mit ungleicher Gruppenzahl: alle am ersten Thema", t("2090-01-30").themen.map((x) => x.personen.length), [2, 0, 0, 0]);
check("… und Hinweis im Bericht", a.terminHinweise.some((h) => h.status === "hinweis" && h.fundstelle.startsWith("2090-01-30") && h.text.startsWith("Block mit")));
check("Kein Block: \"/\" bleibt ein Thema mit allen Ausbildern", t("2090-03-20").themen.length === 1 && a.themen.get(t("2090-03-20").themen[0].themaKey).titel === "Knoten / Leitern" && tp("2090-03-20", 0).length === 2);
check("Kein Block: keine Hinweise wegen ungleicher Anzahl", !a.terminHinweise.some((h) => h.fundstelle.startsWith("2090-03-20")));
check("Schreibvariante (Groß/klein) desselben Titels: ein Katalogthema", a.themen.get("knoten / leitern").anzahl === 2);
check("Titel mit \"/\" mehrfach: Blockvorschlag, nicht aufgeteilt", a.blockVorschlaege.length === 1 && a.blockVorschlaege[0].anzahl === 2 && JSON.stringify(a.blockVorschlaege[0].teile) === JSON.stringify(["Knoten", "Leitern"]));
check("Erkannte Blöcke: nur der Standardblock", a.bloecke.length === 1 && a.bloecke[0].name === "AT / ELW-Gruppe / FwDv3 / Maschinisten" && a.bloecke[0].anzahl === 3);
check("F → D, ausgefallen, Grund in bemerkung, keine Themen", t("2090-02-06").kuerzel === "D" && t("2090-02-06").ausgefallen && t("2090-02-06").bemerkung === "Heiligabend" && !t("2090-02-06").themen.length);
check("D ohne Uhrzeit und Ausbilder → ausgefallen", t("2090-02-13").ausgefallen);
check("Ohne Typ → abgeleitet, nicht ausgefallen", t("2090-02-20").kuerzel === "D" && !t("2090-02-20").ausgefallen && a.terminHinweise.some((h) => h.text.includes("Typ fehlt")));
check("Datum außerhalb des Planjahrs korrigiert", t("2090-02-27") && a.terminHinweise.some((h) => h.text.includes("übernommen als 2090-02-27")));
check("G: Freitext statt Katalog, Ort übernommen", t("2090-02-27").themen[0].freitext === "Gruppenführerrunde" && t("2090-02-27").themen[0].themaKey === null && t("2090-02-27").ort === "Halle");
check("K ohne Personen: Freitext-Thema", t("2090-03-13").themen[0].freitext === "Grillen");
check("Vorschlag zum Zusammenführen", a.themenVorschlaege.some((v) => v.von === "Knoten-Übung / Leitern" && v.nach === "Knoten / Leitern"));

const st = (s) => a.personen.get(identitaet(s))?.status;
check("Personen: zugeordnet / mehrdeutig / unbekannt", st("Alpha, J.") === "zugeordnet" && st("Gamma") === "mehrdeutig" && st("Ort Nord") === "unbekannt" && st("XYZ") === "zugeordnet");
check("Platzhalter und Organisationen sind zugeordnet", st("GF") === "zugeordnet" && st("n.n.") === "zugeordnet" && st("DRK") === "zugeordnet" && st("OF Nachbarort") === "zugeordnet");
check("Blatt Gruppenführer: Personen im Abgleich", a.ausgleich.length === 2 && a.personen.get(a.ausgleich[1]).bezug?.kameradId === 4);
check("Blockierend: Fehler + offene Personen", a.blockierend === 3 /* Typ X, Gamma mehrdeutig, Ort Nord unbekannt */, String(a.blockierend));

// Zuordnungsdatei
const zu = {
  personen: { "Gamma": 5, "ort nord": "ort", "Alpha": { extern: { organisation: "Nachbarverein", name: "Frau Alpha" } } },
  themen: { "Knoten-Übung / Leitern": "Knoten / Leitern" },
  bloecke: [["Knoten", "Leitern"]],
};
const b = analysiere({ zeilen: zeilen.filter((z) => z.typ !== "X"), gruppenfuehrer: [], kameraden: K, kategorien: KAT, zuordnung: zu });
const tb = (datum) => b.termine.find((x) => x.datum === datum);
check("Zuordnung Kamerad (Schlüssel ohne Groß/klein)", b.personen.get(identitaet("Gamma")).bezug?.kameradId === 5 && b.personen.get(identitaet("Gamma")).quelle === "Zuordnungsdatei");
gleich("Zuordnung extern", b.personen.get(identitaet("Alpha")).bezug, { art: "extern", name: "Frau Alpha", organisation: "Nachbarverein", funktion: null });
check("Zuordnung \"ort\": Eintrag wandert in termine.ort, nicht unter die Verantwortlichen",
  tb("2090-01-02").ort === "Ort Nord" && tb("2090-01-02").themen[3].personen.length === 0);
check("Bestätigter Block wird aufgeteilt, positionsgleich", JSON.stringify(tb("2090-03-20").themen.map((x) => [b.themen.get(x.themaKey).titel, x.personen.length])) === JSON.stringify([["Knoten", 1], ["Leitern", 1]]));
check("Bestätigter Block: Groß/klein-Variante ebenfalls, Block vermerkt", tb("2090-03-27").themen.length === 2 && tb("2090-03-27").blockKey && b.bloecke.length === 2);
check("Ganzer Titel über Zuordnung zusammengeführt, dann als Block aufgeteilt", JSON.stringify(tb("2090-04-03").themen.map((x) => b.themen.get(x.themaKey).titel)) === JSON.stringify(["Knoten", "Leitern"]) && !b.themen.has("knoten-übung"));
const g = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "Alt / Titel", "Alpha")], kameraden: K, kategorien: KAT, zuordnung: { themen: { "Alt / Titel": "Neuer Titel" } } });
check("Ganzer Titel über Zuordnung zusammengeführt (ohne Block)", g.themen.has("neuer titel") && g.termine[0].themen.length === 1);
check("Keine Blockvorschläge mehr", b.blockVorschlaege.length === 0);
check("Nichts blockiert mehr", b.blockierend === 0, String(b.blockierend));

const c = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "X", "B. Alpha / B.Alpha")], kameraden: K, kategorien: KAT, zuordnung: { personen: { "B. Alpha": 1, "B.Alpha": 2 } } });
check("Widersprüchliche Zuordnung von Schreibvarianten → Fehler", [...c.personen.values()][0].status === "fehler");
const d = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "X", "Alpha")], kameraden: K, kategorien: KAT, zuordnung: { personen: { Alpha: 99 } } });
check("Zuordnung auf nicht vorhandenen Kameraden → Fehler", [...d.personen.values()][0].status === "fehler");
const e = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "X", "Beta")], kameraden: K, kategorien: KAT, mehrdeutigErster: true });
check("Testdaten-Option: mehrdeutig → erster Kandidat", [...e.personen.values()][0].bezug?.kameradId === 2);
const f = analysiere({ zeilen: [Z("2090-01-02", "D", "19:30", "X")], kameraden: K, kategorien: KAT, zuordnung: { bloecke: [["Nie", "Da"]] } });
check("Bestätigter Block, der nicht vorkommt → Hinweis", f.terminHinweise.some((h) => h.text === "Block kommt im Import nicht vor"));

// Bericht und Vorlage
const zeilenBericht = berichtZeilen(a, K);
check("Bericht enthält offene Personen mit Kandidaten", zeilenBericht.some((z) => z.art === "person" && z.status === "mehrdeutig" && z.kandidaten.includes("5: Gamma, Mathis")));
check("Bericht: Termin-Fehler, erkannter Block, Blockvorschlag", zeilenBericht.some((z) => z.art === "termin" && z.status === "fehler") && zeilenBericht.some((z) => z.art === "block" && z.status === "erkannt") && zeilenBericht.some((z) => z.art === "block" && z.status === "vorschlag"));
const text = csv([{ art: "a;b", status: 'x"y', schreibweise: "z" }]);
check("CSV: BOM, Semikolon, Quoting", text.startsWith("\uFEFFart;status;") && text.includes('"a;b";"x""y";z'));
const v = zuordnungsVorlage(a, { personen: { Omega: 5 } });
check("Vorlage: offene Personen mit null, vorhandene bleiben", v.personen.Gamma === null && v.personen.Omega === 5 && !("Alpha, J." in v.personen));
check("Vorlage: Vorschläge getrennt von wirksamen Einträgen", v.themen_vorschlaege["Knoten-Übung / Leitern"] === "Knoten / Leitern" && Object.keys(v.themen).length === 0 && v.bloecke.length === 0 && JSON.stringify(v.bloecke_vorschlaege) === JSON.stringify([["Knoten", "Leitern"]]));

console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
