// Eingabeprüfung und Hinweise der Dienstplan-API (src/lib/dienstplan/eingabe.ts,
// hinweise.ts). Ohne Server und ohne Datenbank.
// Aufruf: node scripts/test-dienstplan-eingabe.mjs
import {
  pruefeBereich, pruefeBlock, pruefeExternePerson, pruefeKategorie, pruefePlanNeu, pruefeRegel, pruefeRegelVollstaendig, pruefePlanStatus, pruefeTermin, pruefeTerminThema,
  pruefeTerminThemaAendern, pruefeTerminZustand, pruefeThema, pruefeVerantwortlicher,
} from "../src/lib/dienstplan/eingabe.ts";
import { ersetzeId, unterschiede, zustandVon } from "../src/lib/dienstplan/rueckgaengig.ts";
import { berechneHinweise } from "../src/lib/dienstplan/hinweise.ts";

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};
const gut = (name, r, soll) => check(name, r.ok && (soll === undefined || JSON.stringify(r.daten) === JSON.stringify(soll)), JSON.stringify(r));
const schlecht = (name, r, teil) => check(name, !r.ok && (!teil || r.fehler.includes(teil)), JSON.stringify(r));

// Pläne
gut("Plan neu, generieren Standard true", pruefePlanNeu({ jahr: 2027 }), { jahr: 2027, generieren: true, zwischendienstVersatz: 0 });
gut("Plan neu ohne Generator", pruefePlanNeu({ jahr: 2027, generieren: false }), { jahr: 2027, generieren: false, zwischendienstVersatz: 0 });
gut("Plan neu mit Versatz 2", pruefePlanNeu({ jahr: 2027, zwischendienstVersatz: 2 }), { jahr: 2027, generieren: true, zwischendienstVersatz: 2 });
schlecht("Plan neu: Versatz 4", pruefePlanNeu({ jahr: 2027, zwischendienstVersatz: 4 }), "zwischendienstVersatz");
schlecht("Plan: Jahr als Text", pruefePlanNeu({ jahr: "2027" }));
schlecht("Plan: Jahr außerhalb", pruefePlanNeu({ jahr: 2101 }));
gut("Status freigegeben", pruefePlanStatus({ status: "freigegeben" }));
schlecht("Status unbekannt", pruefePlanStatus({ status: "fertig" }));

// Termine
gut("Termin neu minimal", pruefeTermin({ datum: "2027-01-05", kategorieId: 1 }, "neu"), { datum: "2027-01-05", kategorieId: 1 });
gut("Termin: Uhrzeit mit Sekunden → HH:MM, Texte getrimmt, leer → null",
  pruefeTermin({ datum: "2027-01-05", kategorieId: 1, uhrzeit: "19:30:00", ort: "  Halle  Nord ", bemerkung: "  " }, "neu"),
  { datum: "2027-01-05", kategorieId: 1, uhrzeit: "19:30", ort: "Halle Nord", bemerkung: null });
schlecht("Termin neu ohne Kategorie", pruefeTermin({ datum: "2027-01-05" }, "neu"), "kategorieId");
schlecht("Termin: 30. Februar", pruefeTermin({ datum: "2027-02-30", kategorieId: 1 }, "neu"), "datum");
schlecht("Termin: Uhrzeit 24:00", pruefeTermin({ uhrzeit: "24:00" }, "aendern"), "uhrzeit");
schlecht("Termin: Dauer 0", pruefeTermin({ dauerMinuten: 0 }, "aendern"));
gut("Termin ändern: nur vorhandene Felder, null leert", pruefeTermin({ uhrzeit: null, ausgefallen: true, unbekannt: 1 }, "aendern"), { uhrzeit: null, ausgefallen: true });
schlecht("Termin ändern ohne Felder", pruefeTermin({ unbekannt: 1 }, "aendern"), "Keine");
gut("Notizen mehrzeilig bleiben mehrzeilig", pruefeTermin({ notizen: "Zeile 1\nZeile 2" }, "aendern"), { notizen: "Zeile 1\nZeile 2" });
schlecht("Bemerkung zu lang", pruefeTermin({ bemerkung: "x".repeat(201) }, "aendern"), "zu lang");

// Themen am Termin, Verantwortliche
gut("Termin-Thema aus Katalog", pruefeTerminThema({ themaId: 3 }), { art: "thema", themaId: 3 });
gut("Termin-Thema Freitext", pruefeTerminThema({ titelFreitext: " Weihnachtsfeier " }), { art: "freitext", titel: "Weihnachtsfeier" });
gut("Termin-Thema Block", pruefeTerminThema({ blockId: 2, themaId: null }), { art: "block", blockId: 2 });
schlecht("Termin-Thema: zwei Angaben", pruefeTerminThema({ themaId: 1, blockId: 2 }), "Genau eins");
schlecht("Termin-Thema: nichts", pruefeTerminThema({}), "Genau eins");
gut("Verschieben: Position und Termin", pruefeTerminThemaAendern({ position: 2, terminId: 7 }), { position: 2, terminId: 7 });
schlecht("Verschieben: Position 0", pruefeTerminThemaAendern({ position: 0 }));
gut("Verantwortlicher Kamerad", pruefeVerantwortlicher({ kameradId: 5 }), { art: "kamerad", kameradId: 5 });
gut("Verantwortlicher extern", pruefeVerantwortlicher({ externePersonId: 2 }), { art: "extern", externePersonId: 2 });
schlecht("Verantwortlicher: Platzhalter nicht über die API", pruefeVerantwortlicher({ kameradId: 5, platzhalter: "offen" }), "Altdaten");
schlecht("Verantwortlicher: beides", pruefeVerantwortlicher({ kameradId: 5, externePersonId: 2 }));

// Kataloge
gut("Thema neu", pruefeThema({ titel: "  Erste  Hilfe ", pflichtJaehrlich: true }, "neu"), { titel: "Erste Hilfe", pflichtJaehrlich: true });
schlecht("Thema neu ohne Titel", pruefeThema({ titel: "  " }, "neu"), "titel");
schlecht("Thema: pflichtJaehrlich als Text", pruefeThema({ pflichtJaehrlich: "ja" }, "aendern"));
gut("Block neu", pruefeBlock({ name: "AT-Block", themaIds: [1, 2, 3] }, "neu"), { name: "AT-Block", themaIds: [1, 2, 3] });
schlecht("Block mit einem Thema", pruefeBlock({ name: "x", themaIds: [1] }, "neu"), "2 bis 20");
schlecht("Block mit doppeltem Thema", pruefeBlock({ name: "x", themaIds: [1, 1] }, "neu"), "doppelt");
gut("Externe Person nur Organisation", pruefeExternePerson({ organisation: "DRK" }, "neu"), { organisation: "DRK" });
schlecht("Externe Person ohne Name und Organisation", pruefeExternePerson({ funktion: "x" }, "neu"), "name oder organisation");
schlecht("Externe Person: E-Mail ungültig", pruefeExternePerson({ name: "A", email: "kein-at" }, "neu"), "email");

// Verwaltung
gut("Kategorie neu", pruefeKategorie({ kuerzel: "ü", name: " Übung ", farbe: "green", standardUhrzeit: "18:00" }, "neu"), { kuerzel: "Ü", name: "Übung", farbe: "green", standardUhrzeit: "18:00" });
schlecht("Kategorie: F ist kein Kürzel", pruefeKategorie({ kuerzel: "F", name: "Frei", farbe: "gray" }, "neu"), "ausgefallen");
schlecht("Kategorie: Farbe ohne Token", pruefeKategorie({ kuerzel: "X", name: "x", farbe: "#ff0000" }, "neu"), "farbe");
schlecht("Kategorie: Kürzel mit Ziffer", pruefeKategorie({ kuerzel: "D1", name: "x", farbe: "blue" }, "neu"), "kuerzel");
gut("Regel neu (Zyklus)", pruefeRegel({ name: "DA", typ: "wochen_zyklus", wochentag: 2, uhrzeit: "19:30", gueltigAb: "2027-01-01", ankerDatum: "2026-04-28", muster: ["d", " ", "D", "z"] }, "neu"),
  { name: "DA", typ: "wochen_zyklus", wochentag: 2, uhrzeit: "19:30", gueltigAb: "2027-01-01", ankerDatum: "2026-04-28", muster: ["D", "", "D", "Z"] });
schlecht("Regel: Wochentag 8", pruefeRegel({ name: "x", typ: "wochen_zyklus", wochentag: 8, uhrzeit: "19:30", gueltigAb: "2027-01-01" }, "neu"), "wochentag");
schlecht("Regel: n-ter 6", pruefeRegel({ nterWochentag: 6 }, "aendern"), "nterWochentag");
gut("Regel: Monate sortiert", pruefeRegel({ monate: [11, 2, 8, 5] }, "aendern"), { monate: [2, 5, 8, 11] });
check("Vollständig: Zyklus ohne Anker", pruefeRegelVollstaendig({ typ: "wochen_zyklus", muster: ["D"] }) === "wochen_zyklus braucht ankerDatum");
check("Vollständig: Monats-Regel ohne Kürzel", pruefeRegelVollstaendig({ typ: "monats_wochentag", nterWochentag: 3, monate: [2] }) === "monats_wochentag braucht kategorieKuerzel");
check("Vollständig: bis vor ab", pruefeRegelVollstaendig({ typ: "wochen_zyklus", ankerDatum: "2026-01-06", muster: ["D"], gueltigAb: "2027-01-01", gueltigBis: "2026-12-31" }) === "gueltigBis liegt vor gueltigAb");
check("Vollständig: gültige Monats-Regel", pruefeRegelVollstaendig({ typ: "monats_wochentag", nterWochentag: -1, monate: [12], kategorieKuerzel: "K" }) === null);
gut("Bereich neu", pruefeBereich({ name: "Technische Hilfe" }, "neu"), { name: "Technische Hilfe" });
schlecht("Bereich ändern ohne Felder", pruefeBereich({}, "aendern"));

// Termin-Zustand (Rückgängig/Wiederholen)
const Z = { datum: "2027-01-05", kategorieId: 1, themen: [] };
gut("Zustand minimal: fehlende Felder → null/false", pruefeTerminZustand(Z),
  { datum: "2027-01-05", uhrzeit: null, dauerMinuten: null, kategorieId: 1, ausgefallen: false, ort: null, bemerkung: null, notizen: null, themen: [] });
check("Zustand mit Thema, Freitext, Block und drei Arten Verantwortlicher", pruefeTerminZustand({ ...Z, uhrzeit: "19:30", themen: [
  { themaId: 3, ausBlockId: 2, verantwortliche: [{ kameradId: 5 }, { externePersonId: 1 }, { platzhalter: "offen" }] },
  { titelFreitext: " Grillen ", verantwortliche: [] }] }).ok);
schlecht("Zustand: Thema mit themaId und Freitext", pruefeTerminZustand({ ...Z, themen: [{ themaId: 1, titelFreitext: "x", verantwortliche: [] }] }), "genau eins");
schlecht("Zustand: Verantwortlicher mit zwei Bezügen", pruefeTerminZustand({ ...Z, themen: [{ themaId: 1, verantwortliche: [{ kameradId: 1, externePersonId: 2 }] }] }), "genau eins");
schlecht("Zustand: unbekannter Platzhalter", pruefeTerminZustand({ ...Z, themen: [{ themaId: 1, verantwortliche: [{ platzhalter: "alle" }] }] }), "platzhalter");
schlecht("Zustand: themen fehlt", pruefeTerminZustand({ datum: "2027-01-05", kategorieId: 1 }), "themen");
schlecht("Zustand: ungültiges Datum", pruefeTerminZustand({ ...Z, datum: "2027-02-30" }), "datum");
schlecht("Zustand: zu viele Themen", pruefeTerminZustand({ ...Z, themen: Array.from({ length: 31 }, () => ({ themaId: 1, verantwortliche: [] })) }), "30");

const Q = (id, stempel, themen = [], extra = {}) => ({ id, datum: "2027-01-05", uhrzeit: "19:30", dauerMinuten: null, kategorieId: 1, ausgefallen: false,
  ort: null, bemerkung: null, notizen: null, aktualisiertAm: stempel, quelle: "rhythmus", themen, ...extra });
const P = (titel, themaId, verantwortliche = [], freitext = false) => ({ id: 99, position: 1, themaId, titel, freitext, ausBlockId: null, verantwortliche });
const zv = zustandVon(Q(1, "a", [P("Knoten", 7, [{ id: 1, kameradId: 5, externePersonId: null, platzhalter: null, name: "x" }]), P("Grillen", null, [], true)]));
check("zustandVon: Katalogthema mit themaId, Freitext mit Titel, Verantwortliche ohne Namen und ids",
  JSON.stringify(zv.themen) === JSON.stringify([
    { themaId: 7, titelFreitext: null, ausBlockId: null, verantwortliche: [{ kameradId: 5, externePersonId: null, platzhalter: null }] },
    { themaId: null, titelFreitext: "Grillen", ausBlockId: null, verantwortliche: [] }]));
check("zustandVon besteht die Prüfung der Zustand-Route", pruefeTerminZustand(zv).ok);
const u = unterschiede([Q(1, "a"), Q(2, "b"), Q(3, "c", [], { quelle: "manuell" })], [Q(1, "a"), Q(2, "b2", [P("Funk", 8)]), Q(4, "d", [], { quelle: "manuell" })]);
check("unterschiede: geändert, angelegt, gelöscht; unverändert nicht",
  u.length === 3 && u.find((a) => a.terminId === 2)?.vorher.themen.length === 0 && u.find((a) => a.terminId === 2)?.nachher.themen.length === 1
  && u.find((a) => a.terminId === 2)?.stempel === "b2" && u.find((a) => a.terminId === 4)?.vorher === null && u.find((a) => a.terminId === 3)?.nachher === null
  && !u.some((a) => a.terminId === 1));
const e = ersetzeId([{ text: "x", aenderungen: [{ terminId: 3, vorher: null, nachher: null, stempel: null }] }, { text: "y", aenderungen: [{ terminId: 5, vorher: null, nachher: null, stempel: null }] }], 3, 30);
check("ersetzeId: alte id in allen Einträgen ersetzt", e[0].aenderungen[0].terminId === 30 && e[1].aenderungen[0].terminId === 5);

// Hinweise
const T = (id, datum, kuerzel, themen = [], extra = {}) => ({ id, datum, kuerzel, ausgefallen: false, feiertag: null, themen, ...extra });
const th = (id, titel, verantwortliche = [], themaId = null) => ({ id, titel, themaId, verantwortliche });
const v = (kameradId, name) => ({ kameradId, name });
const h = berechneHinweise([
  T(1, "2027-01-05", "D"),
  T(2, "2027-01-19", "D", [th(10, "Knoten", [], 7)]),
  T(3, "2027-01-26", "Z", [th(11, "Funk", [v(5, "Alpha")])]),
  T(4, "2027-01-26", "K", [th(12, "Grillen", [v(5, "Alpha")])]),
  T(5, "2027-04-05", "D", [th(13, "TH", [v(6, "Beta")])], { feiertag: "Ostermontag" }),
  T(6, "2027-02-02", "D", [], { ausgefallen: true, feiertag: "x" }),
], [{ id: 7, titel: "Knoten" }, { id: 8, titel: "Erste Hilfe" }]);
const arten = (a) => h.filter((x) => x.art === a);
check("Hinweis: Dienstabend ohne Thema (nicht bei Z, nicht ausgefallen)", arten("ohne_thema").map((x) => x.terminId).join() === "1");
check("Hinweis: Position ohne Verantwortliche nur bei D", arten("ohne_verantwortliche").map((x) => x.terminId).join() === "2");
check("Hinweis: Feiertag (nicht bei ausgefallenen)", arten("feiertag").map((x) => x.terminId).join() === "5" && arten("feiertag")[0].text.includes("Ostermontag"));
check("Hinweis: Person am selben Tag in zwei Terminen", arten("doppelt").length === 1 && arten("doppelt")[0].text.includes("Alpha") && arten("doppelt")[0].text.includes("26.01."));
check("Hinweis: fehlendes Pflichtthema", arten("pflichtthema").map((x) => x.text).join() === "Pflichtthema „Erste Hilfe“ fehlt im Plan");

console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
