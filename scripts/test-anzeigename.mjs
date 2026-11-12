// Unit-Test der Anzeigename-Regel (src/lib/mitglieder/anzeigename.ts, Spec 4.2).
// Aufruf: node scripts/test-anzeigename.mjs   (kein Server, keine Datenbank nötig)
import {
  anzeigename,
  anzeigenameDetail,
  anzeigenamen,
  anzeigenameExtern,
} from "../src/lib/mitglieder/anzeigename.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};

let nextId = 1;
const k = (vorname, name, extra = {}) => ({ id: nextId++, vorname, name, ...extra });
const namen = (liste) => liste.map((p) => anzeigenamen(liste).get(p.id).text);

// Regel 2: eindeutiger Nachname
const kraemer = k("Hans", "Krämer");
const bruns = k("Ben", "Bruns");
check("eindeutiger Nachname", namen([kraemer, bruns]), ["Krämer", "Bruns"]);
check("leere Vergleichsmenge", anzeigename(kraemer, []), "Krämer");
check("Person selbst im Kontext stört nicht", anzeigename(kraemer, [kraemer]), "Krämer");

// Regel 3: Esters-Fall und Heilemann-Fall
const esters = [k("Markus", "Esters"), k("Manuel", "Esters")];
check("Esters-Fall: Mar. / Man.", namen(esters), ["Esters, Mar.", "Esters, Man."]);
const heilemann = [k("Ingo", "Heilemann"), k("Thomas", "Heilemann")];
check("Heilemann-Fall: I. / T.", namen(heilemann), ["Heilemann, I.", "Heilemann, T."]);
const drei = [k("Markus", "Esters"), k("Manuel", "Esters"), k("Thomas", "Esters")];
check("drei gleiche Nachnamen", namen(drei), ["Esters, Mar.", "Esters, Man.", "Esters, T."]);
check("Esters neben anderen Namen", namen([...esters, kraemer]), ["Esters, Mar.", "Esters, Man.", "Krämer"]);
check("Vorname ist Präfix eines anderen: ganzer Vorname", namen([k("Jan", "Meyer"), k("Jannik", "Meyer")]), ["Meyer, Jan", "Meyer, Jann."]);
check("Präfix endet auf Buchstaben (Bindestrich)", namen([k("Karl", "Otten"), k("Karl-Heinz", "Otten")]), ["Otten, Karl", "Otten, Karl-H."]);
check("Groß-/Kleinschreibung beim Nachnamen egal", namen([k("Anna", "krämer"), k("Bernd", "Krämer")]), ["krämer, A.", "Krämer, B."]);
check("Leerzeichen werden bereinigt", namen([k("  Ingo ", " Heilemann  "), k("Thomas", "Heilemann")]), ["Heilemann, I.", "Heilemann, T."]);
check("Umlaute im Präfix", namen([k("Ömer", "Kaya"), k("Olaf", "Kaya")]), ["Kaya, Ö.", "Kaya, O."]);

// Regel 4: identische Namen (Vater und Sohn)
const vater = k("Hans", "Müller");
const sohn = k("Hans", "Müller");
check("identische Namen: mehrdeutig, beide", [anzeigenameDetail(vater, [vater, sohn]), anzeigenameDetail(sohn, [vater, sohn])],
  [{ text: "Müller, Hans", mehrdeutig: true }, { text: "Müller, Hans", mehrdeutig: true }]);
check("identische Namen, Groß-/Kleinschreibung egal", anzeigenameDetail(k("hans", "müller"), [vater]).mehrdeutig, true);
check("eindeutige Namen sind nicht mehrdeutig", anzeigenameDetail(esters[0], esters).mehrdeutig, false);

// Regel 1: Spitzname
const hgl = k("Heinz-Georg", "Lindemann", { spitzname: "HGL", spitznameAnzeigen: true });
check("Spitzname wird angezeigt", anzeigename(hgl, [hgl, kraemer]), "HGL");
check("Spitzname ohne Haken: normale Regel", anzeigename(k("Heinz", "Lindner", { spitzname: "HL", spitznameAnzeigen: false }), []), "Lindner");
check("Haken ohne Spitzname: normale Regel", anzeigename(k("Heinz", "Lindner", { spitzname: "  ", spitznameAnzeigen: true }), []), "Lindner");
check("Spitzname wird bereinigt", anzeigename(k("A", "B", { spitzname: " HGL ", spitznameAnzeigen: true }), []), "HGL");
const vaterSp = { ...vater, spitzname: "Hans sen.", spitznameAnzeigen: true };
check("Spitzname löst identische Namen für beide", namen([vaterSp, sohn]), ["Hans sen.", "Müller"]);
check("Spitzname des Namensvetters: Rest eindeutig", namen([{ ...esters[0], spitzname: "Mäx", spitznameAnzeigen: true }, esters[1]]), ["Mäx", "Esters"]);

// Inaktive
const inaktiv = k("Manuel", "Esters", { aktiv: false });
const markus = k("Markus", "Esters");
check("inaktive Personen im Kontext zählen nicht", anzeigename(markus, [markus, inaktiv]), "Esters");
check("inaktive Person selbst: gegen die aktiven verglichen", anzeigename(inaktiv, [markus, inaktiv]), "Esters, Man.");
check("aktiv fehlt = aktiv", anzeigename(markus, [markus, k("Manuel", "Esters")]), "Esters, Mar.");

// Externe Personen
check("extern: Name mit Organisation", anzeigenameExtern({ name: "Meyer", organisation: "DRK" }), "Meyer (DRK)");
check("extern: nur Organisation", anzeigenameExtern({ name: null, organisation: "DRK" }), "DRK");
check("extern: nur Name", anzeigenameExtern({ name: "Meyer", organisation: null }), "Meyer");
check("extern: ohne Organisation (enge Zelle)", anzeigenameExtern({ name: "Meyer", organisation: "DRK" }, { mitOrganisation: false }), "Meyer");
check("extern: Leerzeichen bereinigt", anzeigenameExtern({ name: " Meyer ", organisation: " OF Lohne " }), "Meyer (OF Lohne)");

console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
