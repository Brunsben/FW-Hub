// Unit-Test Versionen (src/lib/dienstplan/versionen.ts) und Eingabeprüfung dazu.
// Aufruf: node scripts/test-dienstplan-versionen-lib.mjs   (kein Server, keine Datenbank)
import {
  abbildAus, fingerabdruck, geaendertSeitFreigabe, titelVon, vergleiche, wiederherstellPlan, zusammenfassung,
} from "../src/lib/dienstplan/versionen.ts";
import { leseVersionNummer, pruefePlanStatus, pruefeVersion } from "../src/lib/dienstplan/eingabe.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};

const v = (kameradId, name) => ({ kameradId, externePersonId: null, platzhalter: null, name });
const th = (themaId, titel, vs = [], freitext = false) => ({ themaId: freitext ? null : themaId, titel, freitext, ausBlockId: null, verantwortliche: vs });
const t = (id, datum, themen = [], extra = {}) => ({
  id, datum, uhrzeit: "19:30", dauerMinuten: null, kategorieId: 1, kuerzel: "D", quelle: "rhythmus", regelId: 1, rhythmusDatum: datum,
  ausgefallen: false, ort: null, bemerkung: null, notizen: null, aktualisiertAm: "x", feiertag: null, themen, ...extra,
});

// Abbild
const quelle = [t(1, "2027-01-05", [th(10, "Pumpenkunde", [v(5, "Beispiel")]), th(null, "Weihnachtsfeier", [], true)])];
const abbild = abbildAus(2027, quelle);
check("Abbild: Format, Jahr, Felder ohne aktualisiertAm/feiertag", [abbild.format, abbild.jahr, "aktualisiertAm" in abbild.termine[0], "feiertag" in abbild.termine[0]], [1, 2027, false, false]);
check("Abbild: Thema mit id, Freitext mit Text", abbild.termine[0].themen.map((p) => [p.themaId, p.titelFreitext, p.titel]), [[10, null, "Pumpenkunde"], [null, "Weihnachtsfeier", "Weihnachtsfeier"]]);
check("Abbild: Verantwortliche mit Namen zum Zeitpunkt", abbild.termine[0].themen[0].verantwortliche, [{ kameradId: 5, externePersonId: null, platzhalter: null, name: "Beispiel" }]);
check("titelVon", titelVon(abbild.termine[0]), "Pumpenkunde / Weihnachtsfeier");

// Fingerabdruck: Umbenennungen zählen nicht
const a1 = abbildAus(2027, [t(1, "2027-01-05", [th(10, "Pumpenkunde", [v(5, "Beispiel")])])]).termine;
const umbenannt = abbildAus(2027, [t(1, "2027-01-05", [th(10, "Pumpen und Armaturen", [v(5, "Beispiel, B.")])])]).termine;
check("Umbenennung von Thema und Anzeigename ist keine Änderung", fingerabdruck(a1[0]) === fingerabdruck(umbenannt[0]), true);
check("Vergleich: Umbenennung → keine Einträge", vergleiche(a1, umbenannt), []);

// Vergleich
const alt = abbildAus(2027, [
  t(1, "2027-01-05", [th(10, "Pumpenkunde", [v(5, "A")])]),
  t(2, "2027-01-19", [th(11, "Funk")]),
  t(3, "2027-02-02", [th(12, "Knoten")]),
  t(4, "2027-02-16", [th(13, "Leitern", [v(6, "B")])]),
  t(5, "2027-03-02", []),
]).termine;
const neu = abbildAus(2027, [
  t(1, "2027-01-05", [th(10, "Pumpenkunde", [v(5, "A"), v(7, "C")])]),     // Verantwortliche
  t(2, "2027-01-26", [th(11, "Funk")], { uhrzeit: "19:00" }),             // verschoben (Datum + Uhrzeit)
  t(4, "2027-02-16", [th(14, "Atemschutz", [v(6, "B")])], { ort: "Halle" }), // Thema + Ort
  t(5, "2027-03-02", [], { ausgefallen: true, bemerkung: "Feiertag" }),  // abgesagt
  t(9, "2027-03-16", [th(15, "Erste Hilfe")]),                            // neu
]).termine;
const e = vergleiche(alt, neu);
check("Vergleich: Art je Termin, sortiert nach Datum", e.map((x) => [x.terminId, x.art]), [[1, "geaendert"], [2, "verschoben"], [3, "entfallen"], [4, "geaendert"], [5, "geaendert"], [9, "neu"]]);
check("Vergleich: Einzelheiten", e.map((x) => x.details), [
  ["Verantwortliche"], ["Datum 19.01. → 26.01.", "Uhrzeit 19:30 → 19:00"], [], ["Thema", "Ort"], ["abgesagt", "Bemerkung"], [],
]);
check("Vergleich: alt/neu-Köpfe", [e[2].alt, e[2].neu, e[5].alt, e[5].neu.titel], [{ datum: "2027-02-02", uhrzeit: "19:30", titel: "Knoten" }, null, null, "Erste Hilfe"]);
check("Zusammenfassung", zusammenfassung(e), "1 neu, 1 entfallen, 1 verschoben, 3 geändert");
check("Zusammenfassung leer", zusammenfassung([]), "keine Änderungen");
const reihenfolge = vergleiche(
  abbildAus(2027, [t(1, "2027-01-05", [th(10, "P", [v(5, "A"), v(7, "C")])])]).termine,
  abbildAus(2027, [t(1, "2027-01-05", [th(10, "P", [v(7, "C"), v(5, "A")])])]).termine);
check("Vergleich: nur Reihenfolge der Verantwortlichen", reihenfolge.map((x) => x.details), [["Reihenfolge der Verantwortlichen"]]);
// Zuordnung über Datum und Kategorie, wenn ids nicht passen (nach Wiederherstellung)
const nachWh = abbildAus(2027, [t(20, "2027-01-05", [th(10, "Pumpenkunde", [v(5, "A")])]), t(21, "2027-01-19", [th(99, "Neu")])]).termine;
const ew = vergleiche(alt.slice(0, 2), nachWh);
check("Vergleich: neue ids, gleiches Datum/Kategorie → gepaart", ew.map((x) => [x.terminId, x.art, x.details]), [[21, "geaendert", ["Thema"]]]);

// geändert seit Freigabe
check("geändert seit Freigabe: ohne Freigabe keine", [...geaendertSeitFreigabe(null, neu)], []);
check("geändert seit Freigabe: ids", [...geaendertSeitFreigabe(alt, neu)].sort(), [1, 2, 4, 5, 9]);

// Wiederherstellen
const w = wiederherstellPlan(neu, alt);
check("Wiederherstellen: ändern/anlegen/löschen", [w.aendern.map((x) => x.id), w.anlegen.map((x) => x.id), w.loeschen], [[1, 2, 4, 5], [3], [9]]);
check("Wiederherstellen: gleicher Stand → nichts", wiederherstellPlan(alt, alt), { aendern: [], anlegen: [], loeschen: [] });

// Eingabeprüfung
check("Version: Bezeichnung Pflicht", [pruefeVersion({}).ok, pruefeVersion({ bezeichnung: "  " }).ok], [false, false]);
check("Version: Bezeichnung getrimmt", pruefeVersion({ bezeichnung: " Stand nach GF " }), { ok: true, daten: { bezeichnung: "Stand nach GF" } });
check("Version: zu lang", pruefeVersion({ bezeichnung: "x".repeat(121) }).ok, false);
check("Status mit Bezeichnung", pruefePlanStatus({ status: "freigegeben", bezeichnung: "Erste Freigabe" }), { ok: true, daten: { status: "freigegeben", bezeichnung: "Erste Freigabe" } });
check("Status ohne Bezeichnung", pruefePlanStatus({ status: "entwurf" }), { ok: true, daten: { status: "entwurf", bezeichnung: null } });
check("Versionsnummer", [leseVersionNummer("3", false), leseVersionNummer("aktuell", true), leseVersionNummer("aktuell", false), leseVersionNummer("0", false), leseVersionNummer("x", true), leseVersionNummer(null, true)],
  [3, "aktuell", null, null, null, null]);

console.log(fail ? `\n${fail} FEHLER` : "\nAlle Prüfungen bestanden.");
process.exit(fail ? 1 : 0);
