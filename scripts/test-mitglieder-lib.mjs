// Unit-Test der Eingabeprüfung der Mitgliederverwaltung (src/lib/mitglieder/validierung.ts).
// Aufruf: node scripts/test-mitglieder-lib.mjs   (kein Server, keine Datenbank nötig)
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

console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
