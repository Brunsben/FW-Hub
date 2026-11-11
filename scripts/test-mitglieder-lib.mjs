// Unit-Test der Eingabeprüfung der Mitgliederverwaltung (src/lib/mitglieder/validierung.ts).
// Aufruf: node scripts/test-mitglieder-lib.mjs   (kein Server, keine Datenbank nötig)
import { pruefeGroessen } from "../src/lib/psa-groessen.ts";
import { FEHLER_KARTEN_ID, FEHLER_ROLLEN, pruefeLogin, pruefeStammdaten } from "../src/lib/mitglieder/validierung.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};
const st = (b, m = "anlegen") => pruefeStammdaten(b, m);

// Anlegen
check("anlegen: Vor- und Nachname genügen", st({ vorname: " Max ", name: "Muster" }), { ok: true, daten: { vorname: "Max", name: "Muster" } });
check("anlegen: alle Felder, Leerzeichen werden entfernt", st({ vorname: "A", name: "B", dienstgrad: " HFM ", email: "a@b.de", personalnummer: " 123 ", aktiv: false }),
  { ok: true, daten: { vorname: "A", name: "B", dienstgrad: "HFM", email: "a@b.de", personalnummer: "123", aktiv: false } });
check("anlegen: leere optionale Felder werden null", st({ vorname: "A", name: "B", dienstgrad: "", email: "  ", personalnummer: null }),
  { ok: true, daten: { vorname: "A", name: "B", dienstgrad: null, email: null, personalnummer: null } });
check("anlegen: Vorname fehlt", st({ name: "B" }).ok, false);
check("anlegen: Nachname leer", st({ vorname: "A", name: "  " }).ok, false);
check("anlegen: Vorname null", st({ vorname: null, name: "B" }).ok, false);
check("anlegen: kein Objekt", [st(null).ok, st("x").ok, st([]).ok], [false, false, false]);
check("anlegen: Zahl statt Text", st({ vorname: 5, name: "B" }).ok, false);
check("anlegen: zu langer Name", st({ vorname: "x".repeat(101), name: "B" }).ok, false);
check("anlegen: ungültige E-Mail", st({ vorname: "A", name: "B", email: "keine mail" }).ok, false);
check("anlegen: aktiv muss boolean sein", st({ vorname: "A", name: "B", aktiv: "ja" }).ok, false);

// Abgelehnte Felder: Rollen und Karten-ID (mit Hinweis auf den richtigen Ort)
for (const feld of ["psaRolle", "foodRolle", "fkRolle", "funkRolle", "psa_rolle", "food_rolle", "fk_rolle", "funk_rolle", "rollen"]) {
  check(`Feld ${feld} wird abgelehnt (anlegen)`, st({ vorname: "A", name: "B", [feld]: "Admin" }), { ok: false, fehler: FEHLER_ROLLEN });
}
check("Rollen im Body werden auch beim Ändern abgelehnt", st({ dienstgrad: "X", psaRolle: "Admin" }, "aendern"), { ok: false, fehler: FEHLER_ROLLEN });
for (const feld of ["kartenId", "karten_id"]) {
  check(`Feld ${feld} wird abgelehnt (anlegen und ändern)`, [st({ vorname: "A", name: "B", [feld]: "123" }), st({ [feld]: "123" }, "aendern")], [{ ok: false, fehler: FEHLER_KARTEN_ID }, { ok: false, fehler: FEHLER_KARTEN_ID }]);
}
check("Rollen und Karten-ID zusammen: Rollen zuerst gemeldet", st({ vorname: "A", name: "B", psaRolle: "Admin", kartenId: "1" }), { ok: false, fehler: FEHLER_ROLLEN });
check("Hinweistext nennt den richtigen Ort (Rollen)", FEHLER_ROLLEN.includes("Rollen über /mitglieder/[id] → Rollen"), true);
check("Hinweistext nennt den richtigen Ort (Karten-ID)", FEHLER_KARTEN_ID.includes("Karten-ID über den Abschnitt Küche"), true);
// Sonstige unbekannte Felder werden weiter ignoriert
check("id, pin, rolle und Fantasiefelder werden ignoriert", st({ vorname: "A", name: "B", id: 99, pin: "x", rolle: "Admin", quatsch: 1 }), { ok: true, daten: { vorname: "A", name: "B" } });

// Ändern
check("ändern: ein Feld genügt", st({ dienstgrad: "OBM" }, "aendern"), { ok: true, daten: { dienstgrad: "OBM" } });
check("ändern: aktiv allein", st({ aktiv: true }, "aendern"), { ok: true, daten: { aktiv: true } });
check("ändern: leerer Body", st({}, "aendern").ok, false);
check("ändern: nur unbekannte Felder", st({ quatsch: "Admin", pin: "1" }, "aendern").ok, false);
check("ändern: Vorname darf nicht leer werden", st({ vorname: "" }, "aendern").ok, false);
check("ändern: Dienstgrad darf leer werden (null)", st({ dienstgrad: "" }, "aendern"), { ok: true, daten: { dienstgrad: null } });

// Spitzname (Migration 0016)
check("Spitzname und Haken werden übernommen", st({ spitzname: " HGL ", spitznameAnzeigen: true }, "aendern"), { ok: true, daten: { spitzname: "HGL", spitznameAnzeigen: true } });
check("Spitzname leer wird null", st({ spitzname: "" }, "aendern"), { ok: true, daten: { spitzname: null } });
check("Spitzname zu lang", st({ spitzname: "x".repeat(31) }, "aendern").ok, false);
check("spitznameAnzeigen muss boolean sein", st({ spitznameAnzeigen: "ja" }, "aendern").ok, false);
check("anlegen mit Spitzname", st({ vorname: "A", name: "B", spitzname: "AB" }), { ok: true, daten: { vorname: "A", name: "B", spitzname: "AB" } });

// Login
const lg = (b) => pruefeLogin(b, 6);
check("Login: gültig, Rolle Standard User", lg({ benutzername: " max ", pin: "123456" }), { ok: true, daten: { benutzername: "max", pin: "123456", rolle: "User" } });
check("Login: Rolle Admin", lg({ benutzername: "max", pin: "123456", rolle: "Admin" }).daten?.rolle, "Admin");
check("Login: unbekannte Rolle", lg({ benutzername: "max", pin: "123456", rolle: "Chef" }).ok, false);
check("Login: PIN zu kurz", lg({ benutzername: "max", pin: "12345" }).ok, false);
check("Login: PIN fehlt", lg({ benutzername: "max" }).ok, false);
check("Login: Benutzername mit Leerzeichen", lg({ benutzername: "max muster", pin: "123456" }).ok, false);
check("Login: Benutzername leer", lg({ benutzername: "  ", pin: "123456" }).ok, false);
check("Login: Benutzername zu lang", lg({ benutzername: "x".repeat(65), pin: "123456" }).ok, false);
check("Login: kein Objekt", lg("x").ok, false);

// PSA-Größen
const gr = (b) => pruefeGroessen(b);
check("Größen: ein Feld genügt, Leerraum wird entfernt", gr({ jackeGroesse: " 52 " }), { ok: true, daten: { jackeGroesse: "52" } });
check("Größen: leer und null entfernen die Größe", gr({ hoseGroesse: "", stiefelGroesse: null, hemdGroesse: "  " }), { ok: true, daten: { hoseGroesse: null, stiefelGroesse: null, hemdGroesse: null } });
check("Größen: alle sieben Felder", Object.keys(gr({ jackeGroesse: "a", hoseGroesse: "b", stiefelGroesse: "c", handschuhGroesse: "d", hemdGroesse: "e", poloshirtGroesse: "f", fleeceGroesse: "g" }).daten).length, 7);
check("Größen: unbekannte Felder werden ignoriert", gr({ jackeGroesse: "L", name: "x", psaRolle: "Admin" }), { ok: true, daten: { jackeGroesse: "L" } });
check("Größen: nur unbekannte Felder → Fehler", gr({ name: "x" }).ok, false);
check("Größen: leerer Body → Fehler", gr({}).ok, false);
check("Größen: zu lang → Fehler", gr({ jackeGroesse: "x".repeat(21) }).ok, false);
check("Größen: Zahl statt Text → Fehler", gr({ jackeGroesse: 52 }).ok, false);
check("Größen: kein Objekt → Fehler", [gr(null).ok, gr("x").ok, gr([]).ok], [false, false, false]);

console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
