// Einmaliges, idempotentes Seed-Skript für PSA-Stammdaten (Normen + Typen).
// Ausführen:  npx tsx scripts/seed-psa-stammdaten.ts
// Nutzt DATABASE_URL (Default wie src/lib/db/index.ts).
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { psaAusruestungstypen, psaNormen } from "../src/lib/db/schema";

const client = postgres(
  process.env.DATABASE_URL ||
    "postgresql://nocodb:nocodb@localhost:5432/nocodb",
  { max: 1 },
);
const db = drizzle(client);

// [bezeichnung, kategorie, beschreibung, pruefintervallMonate, maxLebensdauerJahre, maxWaeschen]
const NORMEN: Array<
  [string, string, string, number | null, number | null, number | null]
> = [
  [
    "EN 1891:1998",
    "Absturzsicherung",
    "Kernmantelseile mit geringer Dehnung (Halbstatikseile, Typ A ≥ 11 mm). Einsatz bei Höhenrettung, Abseilarbeiten und Seilrettung der Feuerwehr. Jährliche Sachkundigenprüfung; Aussonderung nach Belastung, mechanischer Beschädigung oder spätestens nach 10 Jahren.",
    12,
    10,
    null,
  ],
  [
    "EN 361:2002",
    "Absturzsicherung",
    "Auffanggurte (Vollkörpergurt). Mindestbruchlast 15 kN. Fangpunkt im Rücken (D-Ring). Jährliche Sichtprüfung durch Benutzer, periodische Prüfung durch Sachkundigen. Aussonderung nach Sturzbelastung oder nach Herstellervorgabe.",
    12,
    10,
    null,
  ],
  [
    "EN 362:2004",
    "Absturzsicherung",
    "Verbindungsmittel (Karabiner, Deltakarabiner). Dreifachsicherung, Mindestbruchlast 20 kN axial. Sichtprüfung vor jeder Benutzung.",
    12,
    10,
    null,
  ],
  [
    "EN 363:2008",
    "Absturzsicherung",
    "Systeme zur Absturzsicherung – Gesamtsystem bestehend aus Auffanggurt (EN 361), Verbindungsmittel (EN 362) und Anschlagpunkt.",
    12,
    10,
    null,
  ],
  [
    "EN 136:1998",
    "Atemschutz",
    "Vollmasken für Atemschutzgeräte. Anforderungen: Dichtheit, optische Sichtscheibe, Anschlussgewinde (DIN 40), Ausatemventil, Sprecheinrichtung. Trägerpflicht nach FwDV 7.",
    12,
    null,
    null,
  ],
  [
    "EN 137:2006",
    "Atemschutz",
    "Druckluftatemschutzgeräte mit offenem Kreislauf (Pressluftatmer, PA). Flasche: TÜV-Prüfung alle 5/10 J. (ADR); Gerät: jährliche Sachkundigenprüfung nach FwDV 7.",
    12,
    15,
    null,
  ],
  [
    "EN 14387:2004+A1:2008",
    "Atemschutz",
    "Gasfilter und Kombinationsfilter. Typen A/B/E/K/P, Klassen 1/2/3. Für Fluchtgeräte und Halbmasken im leichten Atemschutz.",
    null,
    null,
    null,
  ],
  [
    "EN 13911:2017",
    "Flammschutzhaube",
    "Schutzkleidung für die Feuerwehr – Anforderungen und Prüfverfahren für Flammschutzhauben. Wird als Ergänzung zu EN 469 und EN 443 getragen.",
    12,
    10,
    20,
  ],
  [
    "EN ISO 14116:2015",
    "Fleece/Softshell",
    "Schutzkleidung mit begrenzter Flammenausbreitung. Gilt für Fleece- und Softshell-Jacken als Zwischenschicht unter EN-469-Oberbekleidung. Index 1 mindestens erforderlich.",
    null,
    null,
    50,
  ],
  [
    "EN 388:2016+A1:2018",
    "Handschuh",
    "Schutzhandschuhe gegen mechanische Risiken. Ergänzung zu EN 659 für mechanischen Schutz.",
    null,
    null,
    null,
  ],
  [
    "EN 659:2003+A1:2008",
    "Handschuh",
    "Schutzhandschuhe für Feuerwehrmänner. Flammen- und Hitzeschutz, Wasserdurchdringung, mechanische Schutzwirkung.",
    12,
    10,
    null,
  ],
  [
    "EN 16471:2014",
    "Helm",
    "Helme für die Waldbrandbekämpfung. Leichter als EN 443; integrierter Gehörschutz.",
    12,
    10,
    null,
  ],
  [
    "EN 16473:2014",
    "Helm",
    "Helme für die technische Rettung. Stoßdämpfung und Durchdringungsschutz nach EN 397 als Basis.",
    12,
    10,
    null,
  ],
  [
    "EN 443:2008",
    "Helm",
    "Helme für die Brandbekämpfung in Gebäuden und Bauwerken. Stoßdämpfung, Durchdringungswiderstand, Flammenschutz, elektrische Isolation (440 V).",
    12,
    10,
    null,
  ],
  [
    "EN ISO 11612:2015",
    "Hemd",
    "Schutzkleidung gegen Hitze und Flammen. Ergänzende Norm für Hemden/Shirts bei Hitzeeinsätzen. Klassen A–F.",
    null,
    null,
    25,
  ],
  [
    "EN ISO 14116:2015",
    "Hemd",
    "Schutzkleidung mit begrenzter Flammenausbreitung, typisch für Unterziehwäsche und Hemden unter EN-469-Kleidung.",
    null,
    null,
    50,
  ],
  [
    "EN 469:2020",
    "Hose",
    "Schutzkleidung für die Feuerwehr – Leistungsanforderungen zur Brandbekämpfung (Hose). Muss als System mit EN-469-Jacke getragen werden.",
    12,
    10,
    20,
  ],
  [
    "EN ISO 11612:2015",
    "Hose",
    "Schutzkleidung gegen Hitze und Flammen – Ergänzende Norm (Hose).",
    null,
    10,
    null,
  ],
  [
    "EN 469:2020",
    "Jacke",
    "Schutzkleidung für die Feuerwehr – Leistungsanforderungen zur Brandbekämpfung (Jacke). Entspricht EN 469:2005+A1:2006 (Vorgänger).",
    12,
    10,
    20,
  ],
  [
    "EN ISO 11612:2015",
    "Jacke",
    "Schutzkleidung gegen Hitze und Flammen. Ergänzende Norm zur EN 469 für Hitzearbeitsplätze.",
    null,
    10,
    null,
  ],
  [
    "EN ISO 14116:2015",
    "Poloshirt",
    "Schutzkleidung mit begrenzter Flammenausbreitung. Für Poloshirts als Unterkleidung.",
    null,
    null,
    50,
  ],
  [
    "DIN 14800-18",
    "Sonstige",
    "Haltegurt für Feuerwehrleute (Positionierungsgurt). Kein Auffanggurt! Jährliche Sichtprüfung und Funktionskontrolle.",
    12,
    null,
    null,
  ],
  [
    "DIN 14920",
    "Sonstige",
    "Feuerwehrleine – Sicherheitsleine nach FwDV. Mindestbruchlast 15 kN, Länge 30 m. Aussonderung spätestens nach 5 Jahren.",
    12,
    5,
    null,
  ],
  [
    "EN ISO 20471:2013+A1:2016",
    "Sonstige",
    "Hochsichtbare Warnschutzkleidung. Klassen 1–3. Pflicht bei Einsätzen an Straßen und Schienen.",
    12,
    3,
    25,
  ],
  [
    "EN 15090:2012",
    "Stiefel",
    "Schuhe für die Feuerwehr. Typen F1/F2/F3. Hitzeschutz, Rutschfestigkeit, Chemikalienbeständigkeit.",
    12,
    10,
    null,
  ],
];

// [bezeichnung, kategorie, normcode, pruefintervallMonate, maxLebensdauerJahre, maxWaeschen]
const TYPEN: Array<
  [string, string, string, number | null, number | null, number | null]
> = [
  ["ADVANCE PRO", "Hose", "EN 469:2020", 12, 10, 20],
  ["ADVANCE PRO II", "Jacke", "EN 469:2020", 12, 10, 20],
  ["Deer Skin", "Handschuh", "EN 388:2016+A1:2018", null, null, null],
  ["F130", "Helm", "EN 443:2008", 12, 10, null],
  ["FIRE ELK", "Handschuh", "EN 659:2003+A1:2008", 12, 10, null],
  ["H1500", "Helm", "EN 443:2008", 12, 10, null],
  ["Haix FireFighter Pro", "Stiefel", "EN 15090:2012", 12, 10, null],
  ["Mechanik", "Handschuh", "EN 388:2016+A1:2018", null, null, null],
  ["Nano", "Flammschutzhaube", "EN 13911:2017", 12, 10, 20],
  ["PS1000", "Jacke", "EN 469:2020", 12, 10, 20],
  ["PS1050", "Hose", "EN 469:2020", 12, 10, 20],
  ["SUPREME PROFI BRAUNSCHWEIG", "Hose", "EN 469:2020", 12, 10, 20],
  ["Supreme II CT", "Jacke", "EN 469:2020", 12, 10, 20],
];

async function main() {
  let normenNeu = 0;
  let normenSkip = 0;
  for (const [
    bezeichnung,
    kategorie,
    beschreibung,
    intervall,
    lebensdauer,
    waeschen,
  ] of NORMEN) {
    // Idempotenz: bezeichnung + ausruestungstypKategorie identifizieren eindeutig.
    const [vorhanden] = await db
      .select({ id: psaNormen.id })
      .from(psaNormen)
      .where(
        and(
          eq(psaNormen.bezeichnung, bezeichnung),
          eq(psaNormen.ausruestungstypKategorie, kategorie),
        ),
      )
      .limit(1);
    if (vorhanden) {
      normenSkip++;
      continue;
    }
    await db.insert(psaNormen).values({
      bezeichnung,
      ausruestungstypKategorie: kategorie,
      normbezeichnung: bezeichnung,
      beschreibung,
      pruefintervallMonate: intervall,
      maxLebensdauerJahre: lebensdauer,
      maxWaeschen: waeschen,
    });
    normenNeu++;
  }
  console.log(`Normen: ${normenNeu} neu, ${normenSkip} übersprungen.`);

  let typenNeu = 0;
  let typenSkip = 0;
  for (const [
    bezeichnung,
    kategorie,
    normcode,
    intervall,
    lebensdauer,
    waeschen,
  ] of TYPEN) {
    // Idempotenz: bezeichnung + Kategorie (typ).
    const [vorhanden] = await db
      .select({ id: psaAusruestungstypen.id })
      .from(psaAusruestungstypen)
      .where(
        and(
          eq(psaAusruestungstypen.bezeichnung, bezeichnung),
          eq(psaAusruestungstypen.typ, kategorie),
        ),
      )
      .limit(1);
    if (vorhanden) {
      typenSkip++;
      continue;
    }
    await db.insert(psaAusruestungstypen).values({
      bezeichnung,
      typ: kategorie,
      norm: normcode,
      pruefintervallMonate: intervall,
      maxLebensdauerJahre: lebensdauer,
      maxWaeschen: waeschen,
    });
    typenNeu++;
  }
  console.log(`Typen: ${typenNeu} neu, ${typenSkip} übersprungen.`);
}

main()
  .then(async () => {
    await client.end();
    console.log("Seed abgeschlossen.");
  })
  .catch(async (e) => {
    console.error("Seed fehlgeschlagen:", e);
    await client.end();
    process.exit(1);
  });
