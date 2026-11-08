// Unit-Test der Rechte-Regeln und der Abschnitts-Auswahl der Mitgliederverwaltung
// (src/lib/mitglieder/rechte.ts und abschnitte.ts).
// Aufruf: node scripts/test-mitglieder-rechte.mjs   (kein Server, keine Datenbank nötig)
// Nutzt das Type-Stripping von Node (>= 22.18) für die reinen TypeScript-Dateien.
import {
  kannMitgliederSehen, kannMitgliedSehen, kannStammdatenBearbeiten,
  kannZugangSehenUndBearbeiten, kannRollenSehenUndBearbeiten, kannKartenIdSehen,
  mitgliedLinkZiel, KEIN_RECHT, kannPsaAbschnittSehen, kannPsaAbschnittBearbeiten, kannFunkAbschnittSehen,
} from "../src/lib/mitglieder/rechte.ts";
import { sichtbareAbschnitte } from "../src/lib/mitglieder/abschnitte.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};
const u = (extra = {}) => ({ kamerad_id: 7, app_role: "User", ...extra });

// Wer die Mitgliederliste und fremde Personen sehen darf
const sehen = [
  ["globaler Admin", u({ app_role: "Admin" }), true],
  ["PSA Admin", u({ psa_rolle: "Admin" }), true],
  ["PSA Kleiderwart", u({ psa_rolle: "Kleiderwart" }), true],
  ["PSA User", u({ psa_rolle: "User" }), false],
  ["Küche Admin", u({ food_rolle: "Admin" }), true],
  ["Küche Mitglied", u({ food_rolle: "Mitglied" }), false],
  ["Funk Admin", u({ funk_rolle: "Admin" }), true],
  ["Funk Gerätewart", u({ funk_rolle: "Gerätewart" }), true],
  ["Funk Einsatzleiter", u({ funk_rolle: "Einsatzleiter" }), false],
  ["Funk Mitglied", u({ funk_rolle: "Mitglied" }), false],
  ["FK-Rolle zählt nicht", u({ fk_rolle: "Admin" }), false],
  ["ohne Rolle", u(), false],
  ["Rollen null", u({ psa_rolle: null, food_rolle: null, funk_rolle: null }), false],
];
for (const [n, user, soll] of sehen) check(`sehen: ${n}`, kannMitgliederSehen(user), soll);

// Fremde und eigene Person
check("eigene Person darf jeder öffnen (ohne Rolle)", kannMitgliedSehen(u(), 7), true);
check("fremde Person ohne Verwaltungsrolle: nein", kannMitgliedSehen(u(), 8), false);
check("fremde Person mit Verwaltungsrolle: ja", kannMitgliedSehen(u({ psa_rolle: "Kleiderwart" }), 8), true);

// Bearbeiten: nur globaler Admin (Stammdaten, Zugang, Rollen)
for (const [n, user] of sehen) {
  const admin = user.app_role === "Admin";
  check(`bearbeiten Stammdaten: ${n}`, kannStammdatenBearbeiten(user), admin);
  check(`Zugang sehen/bearbeiten: ${n}`, kannZugangSehenUndBearbeiten(user), admin);
  check(`Rollen sehen/bearbeiten: ${n}`, kannRollenSehenUndBearbeiten(user), admin);
}
check("Karten-ID sehen: nur Küchen-Admin", [u({ food_rolle: "Admin" }), u({ app_role: "Admin" }), u({ psa_rolle: "Admin" })].map(kannKartenIdSehen), [true, false, false]);

// Link-Ziele
check("Link auf die eigene Person → Profil", mitgliedLinkZiel(u(), 7), "/profil");
check("Link auf die eigene Person (Admin) → Profil", mitgliedLinkZiel(u({ app_role: "Admin" }), 7), "/profil");
check("Link auf fremde Person mit Verwaltungsrolle", mitgliedLinkZiel(u({ food_rolle: "Admin" }), 9), "/mitglieder/9");
check("kein Link auf fremde Person ohne Verwaltungsrolle", mitgliedLinkZiel(u({ psa_rolle: "User" }), 9), null);

// PSA- und Funk-Abschnitt: Verwaltung bei jeder Person, Mitglieder mit Modulrolle nur bei sich selbst
for (const [n, user, id, sehenPsa, bearbeitenPsa, sehenFunk] of [
  ["Kleiderwart, fremde Person", u({ psa_rolle: "Kleiderwart" }), 9, true, true, false],
  ["PSA Admin, fremde Person", u({ psa_rolle: "Admin" }), 9, true, true, false],
  ["PSA-User, fremde Person", u({ psa_rolle: "User" }), 9, false, false, false],
  ["PSA-User, eigene Person", u({ psa_rolle: "User" }), 7, true, false, false],
  ["ohne PSA-Rolle, eigene Person", u(), 7, false, false, false],
  ["Funk Gerätewart, fremde Person", u({ funk_rolle: "Gerätewart" }), 9, false, false, true],
  ["Funk Einsatzleiter, fremde Person", u({ funk_rolle: "Einsatzleiter" }), 9, false, false, false],
  ["Funk Mitglied, eigene Person", u({ funk_rolle: "Mitglied" }), 7, false, false, true],
  ["Funk Mitglied, fremde Person", u({ funk_rolle: "Mitglied" }), 9, false, false, false],
  ["globaler Admin ohne Modulrollen, eigene Person", u({ app_role: "Admin" }), 7, false, false, false],
  ["Küchen-Admin, eigene Person", u({ food_rolle: "Admin" }), 7, false, false, false],
]) {
  check(`PSA-Abschnitt sehen: ${n}`, kannPsaAbschnittSehen(user, id), sehenPsa);
  check(`PSA-Abschnitt bearbeiten: ${n}`, kannPsaAbschnittBearbeiten(user), bearbeitenPsa);
  check(`Funk-Abschnitt sehen: ${n}`, kannFunkAbschnittSehen(user, id), sehenFunk);
}

// Abschnitte: Filter nach sehen, Sortierung nach Reihenfolge, bearbeiten wird durchgereicht
const mk = (key, reihenfolge, recht) => ({ key, titel: key, reihenfolge, rechte: recht, Komponente: () => null });
const abschnitte = [
  mk("verlauf", 900, () => ({ sehen: true, bearbeiten: false })),
  mk("psa", 100, (user) => (user.psa_rolle ? { sehen: true, bearbeiten: user.psa_rolle === "Kleiderwart" } : KEIN_RECHT)),
  mk("stammdaten", 10, () => ({ sehen: true, bearbeiten: false })),
  mk("rollen", 30, (user) => (user.app_role === "Admin" ? { sehen: true, bearbeiten: true } : KEIN_RECHT)),
];
const sicht = (user) => sichtbareAbschnitte(abschnitte, user, 1).map((s) => `${s.abschnitt.key}${s.bearbeiten ? "*" : ""}`);
check("Abschnitte ohne Rollen: nur Stammdaten und Verlauf, sortiert", sicht(u()), ["stammdaten", "verlauf"]);
check("Abschnitte Kleiderwart: PSA mit Bearbeiten (*)", sicht(u({ psa_rolle: "Kleiderwart" })), ["stammdaten", "psa*", "verlauf"]);
check("Abschnitte PSA-User: PSA nur lesend", sicht(u({ psa_rolle: "User" })), ["stammdaten", "psa", "verlauf"]);
check("Abschnitte Admin: Rollen mit Bearbeiten", sicht(u({ app_role: "Admin" })), ["stammdaten", "rollen*", "verlauf"]);
check("Abschnitte: Eingabe bleibt unverändert (keine Mutation)", abschnitte.map((a) => a.key), ["verlauf", "psa", "stammdaten", "rollen"]);

console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
