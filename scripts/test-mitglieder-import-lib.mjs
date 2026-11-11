// Unit-Test des Kameraden-CSV-Imports (src/lib/mitglieder/csv-import.ts):
// Kodierung, beide Formate, Abgleich mit vorhandenen Kameraden.
// Aufruf: node scripts/test-mitglieder-import-lib.mjs   (kein Server, keine Datenbank)
// Alle Namen sind erfunden.
import { abgleichen, dekodiere, istUebernehmbar, parseKameradenCsv, pnrSchluessel, zerlegeZeile } from "../src/lib/mitglieder/csv-import.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};

// ── Kodierung ────────────────────────────────────────────────────────────────
const win1252 = (s) => Uint8Array.from([...s].map((c) => ({ "ü": 0xfc, "ö": 0xf6, "ä": 0xe4, "ß": 0xdf, "é": 0xe9, "Ü": 0xdc }[c] ?? c.charCodeAt(0))));
check("Windows-1252 wird erkannt", dekodiere(win1252("Müller;Jörg;Weiß;René")), "Müller;Jörg;Weiß;René");
check("UTF-8 mit BOM: BOM entfernt", dekodiere(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Müller")])), "Müller");
check("UTF-8 ohne BOM", dekodiere(new TextEncoder().encode("Jörg")), "Jörg");

// ── CSV-Zeilen ───────────────────────────────────────────────────────────────
check("Anführungszeichen und Trenner im Feld", zerlegeZeile('"Meier; Sohn";"Karl ""Kalle""";x', ";"), ["Meier; Sohn", 'Karl "Kalle"', "x"]);
check("leere Zellen bleiben erhalten", zerlegeZeile("1;;a;", ";"), ["1", "", "a", ""]);

// ── Format 1: Tabelle ────────────────────────────────────────────────────────
const t1 = parseKameradenCsv("Nachname;Vorname;Spitzname;Personalnummer\r\nTestmann; Anton ;Toni;0815\r\n\r\nBeispiel;Berta;;\r\n;Ohne;;\r\n");
check("Tabelle: Format", t1.format, "tabelle");
check("Tabelle: Zeilen", t1.zeilen, [
  { zeile: 2, nachname: "Testmann", vorname: "Anton", spitzname: "Toni", personalnummer: "0815" },
  { zeile: 4, nachname: "Beispiel", vorname: "Berta", spitzname: null, personalnummer: null },
]);
check("Tabelle: fehlender Nachname wird gemeldet", t1.fehler, [{ zeile: 5, text: "Nachname fehlt" }]);
const t2 = parseKameradenCsv("Personalnummer,Vorname,Nachname\n7,Carl,Probe\n");
check("Tabelle: Komma, andere Spaltenfolge, ohne Spitzname", t2.zeilen, [{ zeile: 2, nachname: "Probe", vorname: "Carl", spitzname: null, personalnummer: "7" }]);
const t3 = parseKameradenCsv("Name;Vorname;Pers.-Nr.\nX;Y;1\n");
check("Tabelle: Kopf 'Name' und 'Pers.-Nr.'", t3.zeilen[0], { zeile: 2, nachname: "X", vorname: "Y", spitzname: null, personalnummer: "1" });
check("Tabelle: zu langer Spitzname", parseKameradenCsv(`Nachname;Vorname;Spitzname\nA;B;${"x".repeat(31)}\n`).fehler[0].text.startsWith("Spitzname zu lang"), true);
check("leere Datei", parseKameradenCsv("\n\n"), { fehler: "Die Datei ist leer" });
check("unbekanntes Format", "fehler" in parseKameradenCsv("foo;bar\nbaz;qux\n") && !("format" in parseKameradenCsv("foo;bar\nbaz;qux\n")), true);

// ── Format 2: Anwesenheitsliste (Aufbau wie der Export, Namen erfunden) ──────
const liste = [
  ";Anwesenheitsliste;;;;;;",
  "Selektion:;;;;;;;",
  "Organisation;;;Musterstadt, OF;;;;",
  "Ausgewählt;;;5 Personen;;;;",
  ";;;;;;;",
  "1;;Testmann, Anton (002);;;;;",
  "2;;Größer-Weiß, René (21_034);;;;;",
  "3;;Beispiel, Berta (Abc42);;;;;",
  "4;;Musterbank AG (z.Hd. Testmann), Deutsche (156);;;;;",
  "5;;Kaputt ohne Klammer;;;;;",
  "Bearbeiter: Erika Muster;;;;Seite 1 /;;1;11.11.2026",
  "Gesamtsumme Personen: 5 (davon männlich: 3 weiblich: 1 juristisch: 1);;;;;;;",
].join("\r\n");
const a = parseKameradenCsv(dekodiere(win1252(liste)));
check("Liste: Format", a.format, "anwesenheitsliste");
check("Liste: Personen mit Umlauten, Bindestrich und Sonder-Nummern", a.zeilen.slice(0, 3), [
  { zeile: 6, nachname: "Testmann", vorname: "Anton", spitzname: null, personalnummer: "002" },
  { zeile: 7, nachname: "Größer-Weiß", vorname: "René", spitzname: null, personalnummer: "21_034" },
  { zeile: 8, nachname: "Beispiel", vorname: "Berta", spitzname: null, personalnummer: "Abc42" },
]);
check("Liste: Organisation wird als ein Eintrag gelesen", a.zeilen[3], { zeile: 9, nachname: "Musterbank AG (z.Hd. Testmann)", vorname: "Deutsche", spitzname: null, personalnummer: "156" });
check("Liste: unlesbarer Eintrag gemeldet, Kopf/Fuß übersprungen", a.fehler, [{ zeile: 10, text: "Eintrag nicht als „Nachname, Vorname (Personalnummer)“ lesbar" }]);

// ── Abgleich ─────────────────────────────────────────────────────────────────
check("Personalnummer: führende Nullen und Groß/klein egal", [pnrSchluessel("002"), pnrSchluessel("2"), pnrSchluessel("Abc42"), pnrSchluessel("abc42")], ["2", "2", "abc42", "abc42"]);
const vorhandene = [
  { id: 1, name: "Testmann", vorname: "Anton", personalnummer: "2", spitzname: null, aktiv: true },
  { id: 2, name: "Beispiel", vorname: "Berta", personalnummer: null, spitzname: null, aktiv: false },
  { id: 3, name: "Doppel", vorname: "Dora", personalnummer: "500", spitzname: "DD", aktiv: true },
  { id: 4, name: "Zwilling", vorname: "Zoe", personalnummer: null, spitzname: null, aktiv: true },
  { id: 5, name: "Zwilling", vorname: "Zoe", personalnummer: null, spitzname: null, aktiv: true },
];
const z = (zeile, nachname, vorname, personalnummer = null, spitzname = null) => ({ zeile, nachname, vorname, spitzname, personalnummer });
const erg = abgleichen([
  z(1, "Testmann", "Anton", "002"),          // vorhanden (Pnr gleich, Name gleich)
  z(2, "testmann ", "ANTON", "002"),         // Pnr doppelt in Datei
  z(3, "Beispiel", "Berta", "77", "Bert"),   // ergänzen: Pnr und Spitzname, inaktiv
  z(4, "Fremd", "Fritz", "500"),             // Konflikt: Pnr gehört Doppel
  z(5, "Doppel", "Dora", "501"),             // prüfen: gleicher Name, andere Pnr
  z(6, "Zwilling", "Zoe"),                   // prüfen: zwei vorhandene
  z(7, "Neu", "Nora", "900"),                // neu
  z(8, "Neu", "Nora", "901"),                // prüfen: Name doppelt in Datei
  z(9, "Musterbank AG (z.Hd. X)", "Deutsche", "156"), // prüfen: Organisation
  z(10, "Beispiel", "Berta", null, "B2"),    // Konflikt: Kamerad schon in Zeile 3 zugeordnet
  z(11, "Doppel", "Dora", "0500", "Andere"), // Pnr doppelt in der Datei (Zeile 4)
], vorhandene);
const kurz = erg.map((e) => [e.zeile, e.status, e.kameradId, e.ergaenzt, e.hinweis, e.vorausgewaehlt]);
check("Abgleich: Ergebnis je Zeile", kurz, [
  [1, "vorhanden", 1, [], null, false],
  [2, "konflikt", null, [], "Personalnummer schon in Zeile 1", false],
  [3, "ergaenzen", 2, ["personalnummer", "spitzname"], "Kamerad ist inaktiv", true],
  [4, "konflikt", 3, [], "Personalnummer gehört zu Doppel, Dora", false],
  [5, "pruefen", null, [], "Gleicher Name mit Personalnummer 500 vorhanden", false],
  [6, "pruefen", null, [], "2 Kameraden mit diesem Namen vorhanden", false],
  [7, "neu", null, [], null, true],
  [8, "pruefen", null, [], "Gleicher Name schon in Zeile 7", false],
  [9, "pruefen", null, [], "Sieht nicht nach einer Person aus", false],
  [10, "konflikt", 2, [], "Kamerad schon in Zeile 3 zugeordnet", false],
  [11, "konflikt", null, [], "Personalnummer schon in Zeile 4", false],
]);
check("übernehmbar: neu, prüfen, ergänzen", erg.filter(istUebernehmbar).map((e) => e.zeile), [3, 5, 6, 7, 8, 9]);
const nurPnr = abgleichen([z(1, "Doppel", "Dora", "500", "Neu")], vorhandene)[0];
check("Pnr und Name gleich, Spitzname vorhanden: nicht überschrieben", [nurPnr.status, nurPnr.ergaenzt], ["vorhanden", []]);
const spitz = abgleichen([z(1, "Testmann", "Anton", "2", "Toni")], vorhandene)[0];
check("Pnr und Name gleich, Spitzname leer: ergänzen", [spitz.status, spitz.ergaenzt], ["ergaenzen", ["spitzname"]]);

console.log(fail ? `\n${fail} FEHLER` : "\nAlle Prüfungen bestanden.");
process.exit(fail ? 1 : 0);
