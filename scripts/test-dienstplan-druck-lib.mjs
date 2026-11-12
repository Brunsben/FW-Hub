// Unit-Test PDF/Bild-Aufbereitung (src/lib/dienstplan/druck.ts).
// Aufruf: node scripts/test-dienstplan-druck-lib.mjs   (kein Server, keine Datenbank)
import { BILD, bildMasse, druckZeilen, kuerze, legende, titelText } from "../src/lib/dienstplan/druck.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};

const kat = [{ id: 1, kuerzel: "D", name: "Dienstabend", farbe: "blue" }, { id: 2, kuerzel: "K", name: "Kameradschaft", farbe: "pink" }, { id: 3, kuerzel: "J", name: "JHV", farbe: "purple" }];
const t = (id, datum, k, extra = {}) => ({ id, datum, uhrzeit: "19:30", kategorieId: k, kuerzel: kat[k - 1].kuerzel, ausgefallen: false, bemerkung: null, ort: null, themen: [], ...extra });
const termine = [
  t(1, "2027-01-12", 1, { themen: [{ titel: "Atemschutz-Unterweisung", kurztitel: "AS-Unterw.", verantwortliche: [{ name: "Muster" }, { name: "Beispiel, B." }] }, { titel: "Funk", verantwortliche: [] }] }),
  t(2, "2027-03-02", 1, { ausgefallen: true, bemerkung: "Feiertag", themen: [{ titel: "Knoten", verantwortliche: [{ name: "Muster" }] }] }),
  t(3, "2027-12-04", 2, { uhrzeit: null }),
];
const alle = druckZeilen(termine, kat, null);
check("Zeile: Datum, Tag, Kürzel, Farbe", [alle[0].datumLang, alle[0].datumKurz, alle[0].tag, alle[0].uhrzeit, alle[0].kuerzel, alle[0].farbe], ["12.01.2027", "12.01.", "Di", "19:30", "D", "blue"]);
check("Zeile: Titel lang, kurz mit Kurztitel, Verantwortliche", [alle[0].titel, alle[0].kurz, alle[0].verantwortliche], ["Atemschutz-Unterweisung / Funk", "AS-Unterw. / Funk", "Muster, Beispiel, B."]);
check("Abgesagt: grau, entfällt mit Grund und Thema, keine Namen", [alle[1].farbe, alle[1].titel, alle[1].kurz, alle[1].verantwortliche], ["gray", "entfällt: Feiertag (Knoten)", "entfällt", ""]);
check("Ohne Thema: Kategoriename, ohne Uhrzeit leer", [alle[2].titel, alle[2].uhrzeit], ["Kameradschaft", ""]);
check("Halbjahre", [druckZeilen(termine, kat, 1).map((z) => z.terminId), druckZeilen(termine, kat, 2).map((z) => z.terminId)], [[1, 2], [3]]);
check("Legende: nur vorkommende, ohne abgesagte, Katalogreihenfolge", legende(alle, kat).map((k) => k.kuerzel), ["D", "K"]);
check("Titeltext", [titelText(2027, 1), titelText(2027, null)], ["Dienstplan 2027 – 1. Halbjahr", "Dienstplan 2027"]);
check("Bildformat", [BILD.breite, BILD.hoehe], [1290, 2796]);
const frei = BILD.hoehe * (1 - BILD.oben - BILD.unten) - 220;
for (const n of [1, 26, 40, 70]) {
  for (const namen of [false, true]) {
    const m = bildMasse(n, namen);
    check(`Bildmaße ${n} Termine${namen ? " mit Namen" : ""}: passt in den freien Bereich`, n * m.zeile <= frei, true);
  }
}
check("Bildmaße: übliches Halbjahr (26) gut lesbar", bildMasse(26, true).schrift >= 28 && bildMasse(26, false).schrift >= 30, true);
check("Bildmaße: wenige Termine nicht riesig", bildMasse(3, false).zeile, 80);
check("kürzen", [kuerze("Funk", 10), kuerze("Atemschutz-Unterweisung", 10)], ["Funk", "Atemschut…"]);

console.log(fail ? `\n${fail} FEHLER` : "\nAlle Prüfungen bestanden.");
process.exit(fail ? 1 : 0);
