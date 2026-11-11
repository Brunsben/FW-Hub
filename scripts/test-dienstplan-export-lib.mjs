// Unit-Test Exporte (src/lib/dienstplan/export.ts): Termindaten, Formate, CSV,
// Kodierung, Profilprüfung, Änderungsexport, iCal.
// Aufruf: node scripts/test-dienstplan-export-lib.mjs   (kein Server, keine Datenbank)
import {
  aenderungsExport, berlinVersatz, csvFeld, csvZeilen, exportTermine, falte, feldWert, formatiere, icalKalender, icalSequenz,
  icalText, icalUid, imHalbjahr, isoMitVersatz, kodiere, plusMinuten, pruefeProfil, pruefsumme, standText,
} from "../src/lib/dienstplan/export.ts";
import { toenung, wochentagVon } from "../src/lib/dienstplan/druckfarben.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};

// ── Zeit ──
check("plusMinuten: 19:30 + 120", plusMinuten("2027-06-09", "19:30", 120), { datum: "2027-06-09", zeit: "21:30" });
check("plusMinuten: über Mitternacht", plusMinuten("2027-12-31", "22:00", 240), { datum: "2028-01-01", zeit: "02:00" });
check("Berlin: Winter +60, Sommer +120", [berlinVersatz("2027-01-12", "19:30"), berlinVersatz("2027-06-09", "19:30")], [60, 120]);
// 2027: Umstellung 28.03. und 31.10.
check("Berlin: Umstellungstage", [berlinVersatz("2027-03-28", "01:00"), berlinVersatz("2027-03-28", "03:00"), berlinVersatz("2027-10-31", "02:00"), berlinVersatz("2027-10-31", "03:00")], [60, 120, 120, 60]);
check("ISO mit Versatz", [isoMitVersatz("2027-06-09", "19:30"), isoMitVersatz("2027-01-12", "19:30")], ["2027-06-09T19:30:00+02:00", "2027-01-12T19:30:00+01:00"]);
check("Halbjahr", [imHalbjahr("2027-06-30", 1), imHalbjahr("2027-07-01", 1), imHalbjahr("2027-07-01", 2), imHalbjahr("2027-01-01", null)], [true, false, true, true]);
check("Wochentag", [wochentagVon("2027-01-12"), wochentagVon("2026-11-19")], ["Di", "Do"]);
check("Tönung 20 % mit Weiß", toenung("#007AFF", 0.2), "#CCE4FF");

// ── Termindaten ──
const kat = [{ id: 1, kuerzel: "D", name: "Dienstabend", standardDauerMinuten: 120 }, { id: 2, kuerzel: "K", name: "Kameradschaft", standardDauerMinuten: 240 }];
const roh = [
  { id: 11, datum: "2027-06-08", uhrzeit: "19:30", dauerMinuten: null, kategorieId: 1, kuerzel: "D", ausgefallen: false, ort: null, bemerkung: "Halle",
    aktualisiertAm: "2026-11-11T10:00:00.000Z",
    themen: [{ titel: "AT", verantwortliche: [{ name: "Muster, J." }, { name: "Beispiel" }] }, { titel: "Maschinisten", verantwortliche: [] }] },
  { id: 12, datum: "2027-12-04", uhrzeit: "22:00", dauerMinuten: 240, kategorieId: 2, kuerzel: "K", ausgefallen: false, ort: "Gerätehaus", bemerkung: null,
    aktualisiertAm: "2026-11-11T10:00:00.000Z", themen: [] },
  { id: 13, datum: "2027-03-02", uhrzeit: null, dauerMinuten: null, kategorieId: 1, kuerzel: "D", ausgefallen: true, ort: null, bemerkung: null,
    aktualisiertAm: "2026-11-11T10:00:00.000Z", themen: [{ titel: "Funk; Sprechfunk, BOS", verantwortliche: [] }] },
];
const [a, b, c] = exportTermine(roh, kat);
check("Termin: Ende aus Standarddauer", [a.startDatum, a.startZeit, a.endeDatum, a.endeZeit, a.ganztaegig], ["2027-06-08", "19:30", "2027-06-08", "21:30", false]);
check("Termin: Titel und Verantwortliche", [a.titel, a.verantwortliche], ["AT / Maschinisten", "Muster, J., Beispiel"]);
check("Termin: Beschreibung mehrzeilig mit Bemerkung", a.beschreibung, "AT – Muster, J., Beispiel\nMaschinisten\nHalle");
check("Termin ohne Thema: Titel = Kategorie, über Mitternacht", [b.titel, b.endeDatum, b.endeZeit], ["Kameradschaft", "2027-12-05", "02:00"]);
check("Termin ohne Uhrzeit: ganztägig", [c.ganztaegig, c.startZeit, c.endeZeit, c.endeDatum], [true, null, null, "2027-03-02"]);

// ── Formate und Felder ──
check("formatiere", [formatiere("2027-06-08", "19:30", "DD.MM.YYYY HH:mm"), formatiere("2027-06-08", null, "DD.MM.YYYY HH:mm"), formatiere("2027-06-08", null, "HH:mm"), formatiere("2027-06-08", "09:05", "TT.MM.JJJJ")],
  ["08.06.2027 19:30", "08.06.2027", "", "08.06.2027"]);
const f = (feld, format, wert) => feldWert(a, { ueberschrift: "x", feld, format, wert });
check("Felder Datum/Zeit", [f("startDatum"), f("startZeit"), f("endeDatum"), f("endeZeit"), f("start"), f("ende"), f("startIso"), f("endeIso"), f("ganztaegig")],
  ["08.06.2027", "19:30", "08.06.2027", "21:30", "08.06.2027 19:30", "08.06.2027 21:30", "2027-06-08T19:30:00+02:00", "2027-06-08T21:30:00+02:00", "0"]);
check("Felder Text", [f("titel"), f("titelMitKategorie"), f("kategorieKuerzel"), f("kategorieName"), f("ort"), f("bemerkung"), f("terminId"), f("fest", null, "Alle")],
  ["AT / Maschinisten", "Dienstabend: AT / Maschinisten", "D", "Dienstabend", "", "Halle", "11", "Alle"]);
check("titelMitKategorie ohne Thema: kein doppelter Name", feldWert(b, { ueberschrift: "", feld: "titelMitKategorie" }), "Kameradschaft");
check("Ganztägig: Uhrzeitfelder leer, ISO nur Datum", [feldWert(c, { feld: "startZeit" }), feldWert(c, { feld: "start" }), feldWert(c, { feld: "startIso" }), feldWert(c, { feld: "ganztaegig" })], ["", "02.03.2027", "2027-03-02", "1"]);
check("Eigenes Format", f("startDatum", "YYYY-MM-DD"), "2027-06-08");

// ── CSV ──
check("csvFeld: Quoting", [csvFeld("a;b", ";"), csvFeld('Sag "Hallo"', ";"), csvFeld("x\ny", ";"), csvFeld("ok", ";"), csvFeld("a,b", ";")], ['"a;b"', '"Sag ""Hallo"""', '"x\ny"', "ok", "a,b"]);
const divera = { trennzeichen: ";", kopfzeile: true, spalten: [
  { ueberschrift: "Datum", feld: "startDatum" }, { ueberschrift: "Von", feld: "startZeit" }, { ueberschrift: "Bis", feld: "endeZeit" },
  { ueberschrift: "Titel", feld: "titelMitKategorie" }, { ueberschrift: "Text", feld: "beschreibung" }, { ueberschrift: "Ort", feld: "ort" }] };
check("CSV DIVERA", csvZeilen([a], divera), 'Datum;Von;Bis;Titel;Text;Ort\r\n08.06.2027;19:30;21:30;Dienstabend: AT / Maschinisten;"AT – Muster, J., Beispiel\nMaschinisten\nHalle";\r\n');
check("CSV ohne Kopfzeile, Komma", csvZeilen([b], { trennzeichen: ",", kopfzeile: false, spalten: [{ ueberschrift: "", feld: "titel" }, { ueberschrift: "", feld: "ort" }] }), "Kameradschaft,Gerätehaus\r\n");

// ── Kodierung ──
check("UTF-8 mit BOM", [...kodiere("ä", "utf-8-bom")], [0xef, 0xbb, 0xbf, 0xc3, 0xa4]);
check("UTF-8 ohne BOM", [...kodiere("ä", "utf-8")], [0xc3, 0xa4]);
check("Windows-1252: Umlaute, €, Gedankenstrich, unbekannt → ?", [...kodiere("äÖß€–✓", "windows-1252")], [0xe4, 0xd6, 0xdf, 0x80, 0x96, 0x3f]);

// ── Profilprüfung ──
const gut = { name: "Test", trennzeichen: ";", kodierung: "utf-8", kopfzeile: true, nurFreigegeben: false, kategorien: ["d", "z"], spalten: [{ ueberschrift: "Datum", feld: "startDatum", format: "DD.MM.YYYY" }, { ueberschrift: "Empfänger", feld: "fest", wert: "Alle" }] };
const pg = pruefeProfil(gut);
check("Profil gültig, Kürzel groß, fester Wert", pg.ok && [pg.daten.kategorien, pg.daten.spalten[1].wert, pg.daten.spalten[0].format], [["D", "Z"], "Alle", "DD.MM.YYYY"]);
check("Profil Fehler", [
  pruefeProfil({ ...gut, name: "" }).ok, pruefeProfil({ ...gut, trennzeichen: "|" }).ok, pruefeProfil({ ...gut, kodierung: "latin1" }).ok,
  pruefeProfil({ ...gut, spalten: [] }).ok, pruefeProfil({ ...gut, spalten: [{ ueberschrift: "X", feld: "passwort" }] }).ok,
  pruefeProfil({ ...gut, spalten: [{ ueberschrift: "", feld: "titel" }] }).ok, pruefeProfil({ ...gut, spalten: [{ ueberschrift: "X", feld: "startDatum", format: "<script>" }] }).ok,
  pruefeProfil({ ...gut, kategorien: ["D;drop"] }).ok,
], [false, false, false, false, false, false, false, false]);
check("Profil ohne Kopfzeile: Überschrift darf leer sein", pruefeProfil({ ...gut, kopfzeile: false, spalten: [{ ueberschrift: "", feld: "titel" }] }).ok, true);

// ── Änderungsexport ──
check("Prüfsumme stabil und unterschiedlich", [pruefsumme("abc") === pruefsumme("abc"), pruefsumme("abc") !== pruefsumme("abd"), pruefsumme("").length], [true, true, 8]);
const zeile = (t) => [t.startDatum, t.startZeit, t.titel].join("|");
const alle = () => true;
const e1 = aenderungsExport([a, b], zeile, null, "aenderungen", alle);
check("ohne früheren Lauf: alles, keine Löschliste", [e1.exportieren.map((t) => t.terminId), e1.loeschen, Object.keys(e1.stand)], [[11, 12], [], ["11", "12"]]);
const a2 = { ...a, startDatum: "2027-06-15" };
const neuT = { ...b, terminId: 99, startDatum: "2027-09-01" };
const e2 = aenderungsExport([a2, neuT], zeile, e1.stand, "aenderungen", alle);
check("Änderungen: geändert und neu exportiert", e2.exportieren.map((t) => t.terminId), [11, 99]);
check("Änderungen: Löschliste alt (geändert) und entfallen", e2.loeschen.map((l) => [l.terminId, l.datum, l.grund]), [[11, "2027-06-08", "geaendert"], [12, "2027-12-04", "entfallen"]]);
const e3 = aenderungsExport([a2, neuT], zeile, e2.stand, "aenderungen", alle);
check("Änderungen ohne Änderung: leer", [e3.exportieren.length, e3.loeschen.length], [0, 0]);
const e4 = aenderungsExport([a2, neuT], zeile, e2.stand, "komplett", alle);
check("komplett: alles, keine Löschliste", [e4.exportieren.length, e4.loeschen.length], [2, 0]);
const h1 = (d) => imHalbjahr(d, 1);
const e5 = aenderungsExport([a2], zeile, e2.stand, "aenderungen", h1);
check("Halbjahr: Einträge außerhalb bleiben im Stand, nicht in der Löschliste", [Object.keys(e5.stand).sort(), e5.loeschen.length], [["11", "99"], 0]);

// ── iCal ──
check("icalText", icalText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
const lang = "DESCRIPTION:" + "ä".repeat(60);
const gefaltet = falte(lang).split("\r\n");
check("Falten: höchstens 75 Oktette je Zeile, Fortsetzung mit Leerzeichen", gefaltet.every((z) => new TextEncoder().encode(z).length <= 75) && gefaltet.slice(1).every((z) => z.startsWith(" ")) && gefaltet.map((z, i) => (i ? z.slice(1) : z)).join("") === lang, true);
check("UID und SEQUENCE", [icalUid(42), icalSequenz("2020-01-01T01:00:00.000Z"), icalSequenz("2026-11-11T10:00:00.000Z") > icalSequenz("2026-11-11T09:59:00.000Z")], ["dienstplan-42@ofwietmarschen.org", 60, true]);
const kal = icalKalender([a, b, c], { name: "Dienstplan 2027", beschreibung: "Stand: 11.11.2026", jetzt: "2026-11-11T12:00:00.000Z" });
const zeilen = kal.split("\r\n");
check("iCal: Rahmen und Zeitzone", [zeilen[0], zeilen.includes("VERSION:2.0"), zeilen.includes("BEGIN:VTIMEZONE"), zeilen.includes("X-WR-CALNAME:Dienstplan 2027"), kal.endsWith("END:VCALENDAR\r\n")], ["BEGIN:VCALENDAR", true, true, true, true]);
check("iCal: drei Termine mit stabilen UIDs", zeilen.filter((z) => z.startsWith("UID:")), ["UID:dienstplan-11@ofwietmarschen.org", "UID:dienstplan-12@ofwietmarschen.org", "UID:dienstplan-13@ofwietmarschen.org"]);
check("iCal: Zeiten mit TZID, über Mitternacht", [zeilen.includes("DTSTART;TZID=Europe/Berlin:20270608T193000"), zeilen.includes("DTEND;TZID=Europe/Berlin:20270608T213000"), zeilen.includes("DTEND;TZID=Europe/Berlin:20271205T020000")], [true, true, true]);
check("iCal: ganztägig und abgesagt", [zeilen.includes("DTSTART;VALUE=DATE:20270302"), zeilen.includes("DTEND;VALUE=DATE:20270303"), zeilen.includes("STATUS:CANCELLED"), zeilen.some((z) => z.startsWith("SUMMARY:Entfällt: Funk\\; Sprechfunk\\, BOS"))], [true, true, true, true]);
check("iCal: DTSTAMP UTC, Beschreibung mit \\n", [zeilen.includes("DTSTAMP:20261111T120000Z"), zeilen.some((z) => z.startsWith("DESCRIPTION:AT – Muster\\, J.\\, Beispiel\\nMaschinisten"))], [true, true]);
check("iCal: alle Zeilen ≤ 75 Oktette", zeilen.every((z) => new TextEncoder().encode(z).length <= 75), true);
check("Stand", standText("2026-11-11T23:30:00.000Z"), "Stand: 12.11.2026");

console.log(fail ? `\n${fail} FEHLER` : "\nAlle Prüfungen bestanden.");
process.exit(fail ? 1 : 0);
