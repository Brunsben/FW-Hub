# DIENSTPLAN_SPEC.md – Modul „Dienstplan“ für FW-Hub

Stand: 11.11.2026 · Version 6 · Status: Entwurf, fachlich abgestimmt

## 1. Ziel

Der Jahresdienstplan der Ortsfeuerwehr Wietmarschen wird nicht mehr direkt in Excel erstellt, sondern in einem FW-Hub-Modul. Die Planung findet einmal im Jahr in einer Sitzung mit den Gruppenführern statt: Eine Person bedient die Eingabemaske am Laptop, alle anderen verfolgen auf einem Fernseher eine reine Präsentationsansicht, die sich live aktualisiert.

Ergebnisse:
- Plan im Portal für alle Mitglieder (Desktop und mobil)
- Excel-Export (Layout angelehnt an den bisherigen Plan)
- PDF zum Ausdrucken und Verteilen (A4)
- Bild (PNG) je Halbjahr als Smartphone-Hintergrund für WhatsApp
- iCal-Abo und .ics-Download
- CSV-Export mit konfigurierbarer Spaltenfolge (Ziel: Import in DIVERA 24/7)
- Erinnerung an Verantwortliche vor ihrem Termin (E-Mail, weitere Kanäle später)

Nicht-Ziele: Anwesenheitserfassung, Dienstbuch, Fremdtermine, gleichzeitige Bearbeitung durch mehrere Personen, Jugendfeuerwehr.

## 2. Ist-Analyse (bisheriger Plan, 2. Halbjahr 2026)

Eine Zeile pro Termin: Datum | Kürzel | Uhrzeit | Thema | Verantwortlich. Mehrere Themen und die zugehörigen Verantwortlichen werden positionsgleich mit „ / “ getrennt, mehrere Verantwortliche eines Themas mit Komma.

Beobachtungen:
1. Dienstabend (D) und Zwischendienst (Z) folgen einem festen 4-Wochen-Zyklus der Dienstage über Jahresgrenzen hinweg: D, frei, D, Z.
2. Gruppenführerrunde (G: 21.05., 20.08., 19.11.) und Ortskommando (O: 16.07., 15.10.) liegen quartalsweise donnerstags. Die Daten passen sowohl zu „alle 13 Wochen“ als auch zu „3. Donnerstag im Monat, alle 3 Monate“ (siehe Abschnitt 5.2 und offene Punkte).
3. Themenblöcke wiederholen sich (z. B. „AT / ELW-Gruppe / FwDv3 / Maschinisten“ am 09.06., 15.09., 08.12.), Verantwortliche können je Vorkommen abweichen.
4. Verantwortliche sind in der Regel namentlich: Kameraden (teils mit Spitznamen wie „HGL“) oder externe Personen bzw. Organisationen (Gemeindesicherheitsbeauftragter, DRK, THW, OF Lohne). Altdaten enthalten zusätzlich „Gruppenführer“/„GF“ und „n.n.“; beides wird nicht mehr verwendet und nur für den Import als Platzhalter abgebildet (4.3).
5. Dienste außerhalb des Rhythmus kommen vor (21.11.2026, Sa 13:00, Hydrantenpflege).
6. Termine ohne Verantwortliche sind zulässig.
7. Die Namen sind uneinheitlich formatiert und sollen künftig automatisch erzeugt werden.

### 2.1 Auswertung der Excel-Datei (Dienstplan_2026.xlsx, Blätter 2023–2026)

- Spalten: Datum | Typ | Uhrzeit | Thema | Küchendienst (nie befüllt) | Ausbilder | „Option wg. Umbau“ (Ausweichort). In der UI und im Export heißt die Verantwortlichen-Spalte daher „Ausbilder“.
- Kategorien laut Blatt „Diensttypen“: B Brandschutz etc. (Osterfeuer), D Dienstabend, G Gruppenführer, J JHV, K Kameradschaft, O Ortskommando, Z Zwischendienst, F Frei (ausgefallener Dienstabend, z. B. Heiligabend 2024). F wird im Tool nicht als Kategorie geführt, sondern als `ausgefallen = true` mit Grund in `bemerkung`; Anzeige grau „entfällt: Heiligabend“. Farben bisher per bedingter Formatierung; sie werden nicht übernommen (siehe 7.1).
- Rhythmus: D lückenlos 14-täglich 2023–2026. Z 2023–2025 eine Woche nach D, ab 2026 eine Woche vor D (siehe 5.2a). JHV-Termine liegen auf D-Slots.
- Samstags-Dienst Hydrantenpflege jedes Jahr im November (13:00).
- Die Gruppenführerrunde im November ist jedes Jahr die Dienstplanerstellung (16.11.2023, 21.11.2024, 20.11.2025, 19.11.2026).
- Verantwortliche zusätzlich zu Personen: „Gruppenführer“/„GF“ (alle Gruppenführer gemeinsam), „n.n.“/„???“ (noch offen), Organisationen ohne Person („DRK“, „THW“, „OF Lohne“). Dafür gibt es Platzhalter bzw. externe Organisationen (4.3).
- Bestehende Hilfsblätter: „Themen“ (78 Themen mit Häufigkeit) und „Gruppenführer“ (17 Namen mit Anzahl Dienstabende per ZÄHLENWENNS). Die Ausgleichsanzeige (7.2) ersetzt dieses Blatt.

## 3. Begriffe

- Organisation: Ortswehr (später ggf. weitere Ortswehren der Gemeinde, siehe Abschnitt 4.1).
- Plan: Dienstplan einer Organisation für ein Kalenderjahr, Status `entwurf` oder `freigegeben`.
- Termin: Datum, Kategorie, Uhrzeit, optional Ort und Bemerkung.
- Themenposition: ein Thema innerhalb eines Termins (geordnet).
- Thema: Eintrag im Themenkatalog.
- Themenblock: Vorlage aus 2–n Themen, die gemeinsam eingeplant werden.
- Themenvorschlag: Idee aus dem laufenden Jahr (z. B. nach einem Einsatz), die in den Pool kommt.
- Verantwortlicher: Kamerad oder externe Person.

## 4. Datenmodell

### 4.1 Änderungen in `core` (modulübergreifend, eigene Migration)

Spitzname und Anzeigename gehören in die zentrale Mitgliederverwaltung, nicht in dieses Modul. PSA, FoodBot und weitere Module nutzen dieselbe Anzeigelogik.

```ts
// Ergänzung core.kameraden
spitzname: text("spitzname"),                                        // z. B. "HGL"
spitznameAnzeigen: boolean("spitzname_anzeigen").notNull().default(false),
```

Vorbereitung Mehrmandantenfähigkeit (Gemeinde mit mehreren Ortswehren): Alle Tabellen im Schema `dienstplan` tragen bereits jetzt `organisation_id`. Ob es dafür eine zentrale Tabelle `core.organisationen` mit Bezug von `core.kameraden` gibt, ist eine FW-Hub-weite Entscheidung (offene Punkte). Bis dahin gibt es genau eine Organisation, die als Seed angelegt wird. Ein späterer Ausbau erfordert dann keinen Umbau der Dienstplan-Tabellen.

### 4.2 Anzeigename (zentrale Funktion `anzeigename(kamerad, kontext)`)

Regel, angewendet auf aktive Kameraden derselben Organisation:
1. `spitznameAnzeigen = true` und Spitzname vorhanden: Spitzname („HGL“).
2. Sonst Nachname, wenn der Nachname eindeutig ist („Krämer“).
3. Sonst „Nachname, “ plus kürzestes eindeutiges Vornamen-Präfix mit Punkt („Esters, Mar.“ / „Esters, Man.“, „Heilemann, I.“ / „Heilemann, T.“).
4. Sind Nach- und Vorname identisch (z. B. Vater und Sohn), ist keine automatische Unterscheidung möglich. Die Mitgliederverwaltung zeigt dann einen Hinweis, einen Spitznamen zu vergeben.

Externe Personen: Name, optional Organisation in Klammern, wenn Platz ist („Meyer (DRK)“). Im Export ohne Organisation, wenn die Zelle sonst umbricht.

Die Funktion liegt in einem gemeinsamen Paket (z. B. `lib/core/anzeigename.ts`) und ist mit Unit-Tests abgesichert (Esters-Fall, Heilemann-Fall, identische Namen, Spitzname).

### 4.3 Schema `dienstplan` (Drizzle)

Invarianten aus FW-Hub gelten: `core.kameraden` wird nie hart gelöscht; Personenbezug nur über `kamerad_id`; Personendaten werden ausschließlich in der zentralen Mitgliederverwaltung gepflegt.

```ts
import { pgSchema, serial, integer, text, date, time, boolean, timestamp, smallint, jsonb, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { kameraden } from "../core/schema";

export const dp = pgSchema("dienstplan");

export const statusEnum = dp.enum("plan_status", ["entwurf", "freigegeben"]);
export const quelleEnum = dp.enum("termin_quelle", ["rhythmus", "manuell"]);
export const regelTypEnum = dp.enum("regel_typ", ["wochen_zyklus", "monats_wochentag"]);
export const vorschlagStatusEnum = dp.enum("vorschlag_status", ["offen", "uebernommen", "verworfen"]);

export const kategorien = dp.table("kategorien", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  kuerzel: text("kuerzel").notNull(),                 // D, Z, G, O, K, J ...
  name: text("name").notNull(),
  farbe: text("farbe").notNull(),                     // Token aus der Palette, z. B. "blue" (siehe 7.1)
  standardUhrzeit: time("standard_uhrzeit"),
  standardDauerMinuten: smallint("standard_dauer_minuten").notNull().default(120),
  sortierung: smallint("sortierung").notNull().default(0),
  aktiv: boolean("aktiv").notNull().default(true),
}, (t) => [unique().on(t.organisationId, t.kuerzel)]);

// Wiederkehrende Termine
export const rhythmusRegeln = dp.table("rhythmus_regeln", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  name: text("name").notNull(),                       // "Dienstabende", "Gruppenführerrunde"
  typ: regelTypEnum("typ").notNull(),
  wochentag: smallint("wochentag").notNull(),         // ISO: 1 = Mo ... 7 = So
  uhrzeit: time("uhrzeit").notNull(),
  // typ = wochen_zyklus
  ankerDatum: date("anker_datum"),                    // Datum mit Musterindex 0
  muster: text("muster").array(),                     // Kategorie-Kürzel je Woche, '' = frei; z. B. ['D','','D','Z'] oder ['G','','',...13]
  // typ = monats_wochentag
  nterWochentag: smallint("nter_wochentag"),          // 1–5, -1 = letzter
  monate: smallint("monate").array(),                 // z. B. [2,5,8,11]
  kategorieKuerzel: text("kategorie_kuerzel"),        // für monats_wochentag
  gueltigAb: date("gueltig_ab").notNull(),
  gueltigBis: date("gueltig_bis"),
  aktiv: boolean("aktiv").notNull().default(true),
});

export const plaene = dp.table("plaene", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  jahr: integer("jahr").notNull(),
  status: statusEnum("status").notNull().default("entwurf"),
  version: integer("version").notNull().default(0),   // wird bei jeder Änderung erhöht (Live-Ansicht, ETag)
  freigegebenAm: timestamp("freigegeben_am"),
  freigegebenVon: integer("freigegeben_von").references(() => kameraden.id),
}, (t) => [unique().on(t.organisationId, t.jahr)]);

export const termine = dp.table("termine", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plaene.id, { onDelete: "cascade" }),
  datum: date("datum").notNull(),
  uhrzeit: time("uhrzeit"),                           // Beginn
  dauerMinuten: smallint("dauer_minuten"),            // null = Standarddauer der Kategorie; Ende wird berechnet
  kategorieId: integer("kategorie_id").notNull().references(() => kategorien.id),
  quelle: quelleEnum("quelle").notNull().default("manuell"),
  regelId: integer("regel_id").references(() => rhythmusRegeln.id),
  rhythmusDatum: date("rhythmus_datum"),              // ursprüngliches Datum aus der Regel
  ausgefallen: boolean("ausgefallen").notNull().default(false),
  ort: text("ort"),
  bemerkung: text("bemerkung"),                       // kurz, erscheint in Exporten
  notizen: text("notizen"),                           // Ablauf, Material, Fahrzeuge; nur im Portal
  aktualisiertAm: timestamp("aktualisiert_am").notNull().defaultNow(),
});

// Versionen: Abbild des Plans bei Freigabe oder manuell ("Stand nach Sitzung")
export const planVersionen = dp.table("plan_versionen", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plaene.id, { onDelete: "cascade" }),
  nummer: integer("nummer").notNull(),                // 1, 2, 3 ... je Plan
  anlass: text("anlass").notNull(),                   // "freigabe" | "manuell"
  bezeichnung: text("bezeichnung"),                   // z. B. "Stand nach GF-Sitzung"
  inhalt: jsonb("inhalt").notNull(),                  // vollständiges Abbild: Termine, Themen, Verantwortliche (inkl. Anzeigenamen zum Zeitpunkt)
  erstelltAm: timestamp("erstellt_am").notNull().defaultNow(),
  erstelltVon: integer("erstellt_von").notNull().references(() => kameraden.id),
}, (t) => [unique().on(t.planId, t.nummer)]);

// Themenkatalog
export const bereiche = dp.table("bereiche", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  name: text("name").notNull(),                       // Brandbekämpfung, TH, Atemschutz, Funk, Kameradschaft ...
  sortierung: smallint("sortierung").notNull().default(0),
});

export const themen = dp.table("themen", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  titel: text("titel").notNull(),
  kurztitel: text("kurztitel"),                       // für enge Darstellungen (Jahresansicht, Bild)
  bereichId: integer("bereich_id").references(() => bereiche.id),
  notizen: text("notizen"),                           // Inhalte, Material, Hinweise
  pflichtJaehrlich: boolean("pflicht_jaehrlich").notNull().default(false),
  zielgruppe: text("zielgruppe"),                     // z. B. "Atemschutzgeräteträger"; null = alle
  aktiv: boolean("aktiv").notNull().default(true),
}, (t) => [unique().on(t.organisationId, t.titel)]);

export const themenbloecke = dp.table("themenbloecke", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  name: text("name").notNull(),
  aktiv: boolean("aktiv").notNull().default(true),
});

export const themenblockPositionen = dp.table("themenblock_positionen", {
  id: serial("id").primaryKey(),
  blockId: integer("block_id").notNull().references(() => themenbloecke.id, { onDelete: "cascade" }),
  themaId: integer("thema_id").notNull().references(() => themen.id),
  position: smallint("position").notNull(),
});

// Themenpool: Vorschläge übers Jahr
export const themenvorschlaege = dp.table("themenvorschlaege", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),                 // z. B. "Beim Einsatz am ... aufgefallen: ..."
  vorgeschlagenVon: integer("vorgeschlagen_von").notNull().references(() => kameraden.id),
  vorgeschlagenAm: timestamp("vorgeschlagen_am").notNull().defaultNow(),
  status: vorschlagStatusEnum("status").notNull().default("offen"),
  themaId: integer("thema_id").references(() => themen.id), // bei Übernahme
});

// Externe Verantwortliche (wiederverwendbar)
export const externePersonen = dp.table("externe_personen", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  name: text("name"),                                 // null = nur Organisation (z. B. "DRK")
  organisation: text("organisation"),                 // "DRK", "Johanniter", "OF Lohne", "Gemeinde"
  funktion: text("funktion"),                         // "Gemeindesicherheitsbeauftragter"
  email: text("email"),                               // optional, für Erinnerungen
  aktiv: boolean("aktiv").notNull().default(true),
}, (t) => [
  check("name_oder_organisation", sql`num_nonnulls(${t.name}, ${t.organisation}) >= 1`),
]);

// Personen mit Ausgleichsziel (Gruppenführer): sollen etwa gleich oft eingeteilt werden
export const ausgleichPersonen = dp.table("ausgleich_personen", {
  organisationId: integer("organisation_id").notNull(),
  kameradId: integer("kamerad_id").notNull().references(() => kameraden.id),
}, (t) => [unique().on(t.organisationId, t.kameradId)]);

// Exportprofile für CSV (Spaltenfolge frei konfigurierbar)
export const exportProfile = dp.table("export_profile", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull(),
  name: text("name").notNull(),                       // "DIVERA 24/7"
  trennzeichen: text("trennzeichen").notNull().default(";"),
  kodierung: text("kodierung").notNull().default("utf-8-bom"), // "utf-8", "utf-8-bom", "windows-1252"
  kopfzeile: boolean("kopfzeile").notNull().default(true),
  spalten: jsonb("spalten").notNull(),                // [{ "ueberschrift": "Beginn Datum", "feld": "startDatum", "format": "DD.MM.YYYY" }, ...]
  nurFreigegeben: boolean("nur_freigegeben").notNull().default(true),
  kategorien: text("kategorien").array(),             // Filter, null = alle
});

// Protokoll der Exporte (Grundlage für "nur Änderungen exportieren")
export const exportLaeufe = dp.table("export_laeufe", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plaene.id, { onDelete: "cascade" }),
  profilId: integer("profil_id").notNull().references(() => exportProfile.id),
  modus: text("modus").notNull(),                     // "komplett" | "aenderungen"
  stand: jsonb("stand").notNull(),                    // exportierte Termine je terminId mit Prüfsumme der exportierten Felder
  erstelltAm: timestamp("erstellt_am").notNull().defaultNow(),
  erstelltVon: integer("erstellt_von").notNull().references(() => kameraden.id),
});

// Erinnerungen
export const erinnerungsEinstellungen = dp.table("erinnerungs_einstellungen", {
  organisationId: integer("organisation_id").primaryKey(),
  aktiv: boolean("aktiv").notNull().default(false),
  tageVorher: smallint("tage_vorher").array().notNull().default(sql`'{14,3}'`),
  kanaele: text("kanaele").array().notNull().default(sql`'{email}'`),
});

export const erinnerungsVersand = dp.table("erinnerungs_versand", {
  id: serial("id").primaryKey(),
  terminVerantwortlicherId: integer("termin_verantwortlicher_id").notNull().references(() => terminVerantwortliche.id, { onDelete: "cascade" }),
  tageVorher: smallint("tage_vorher").notNull(),
  kanal: text("kanal").notNull(),
  gesendetAm: timestamp("gesendet_am"),
  fehler: text("fehler"),
}, (t) => [unique().on(t.terminVerantwortlicherId, t.tageVorher, t.kanal)]);

// Planinhalt
export const terminThemen = dp.table("termin_themen", {
  id: serial("id").primaryKey(),
  terminId: integer("termin_id").notNull().references(() => termine.id, { onDelete: "cascade" }),
  themaId: integer("thema_id").references(() => themen.id),
  titelFreitext: text("titel_freitext"),              // Sondertermine wie "Weihnachtsfeier"
  position: smallint("position").notNull(),
  ausBlockId: integer("aus_block_id").references(() => themenbloecke.id),
}, (t) => [
  check("thema_oder_freitext", sql`(${t.themaId} IS NOT NULL) <> (${t.titelFreitext} IS NOT NULL)`),
]);

export const terminVerantwortliche = dp.table("termin_verantwortliche", {
  id: serial("id").primaryKey(),
  terminThemaId: integer("termin_thema_id").notNull().references(() => terminThemen.id, { onDelete: "cascade" }),
  kameradId: integer("kamerad_id").references(() => kameraden.id),
  externePersonId: integer("externe_person_id").references(() => externePersonen.id),
  platzhalter: text("platzhalter"),                   // nur für importierte Altdaten: "alle_gf" | "offen"; in der UI nicht auswählbar
  position: smallint("position").notNull(),
}, (t) => [
  check("genau_ein_bezug", sql`num_nonnulls(${t.kameradId}, ${t.externePersonId}, ${t.platzhalter}) = 1`),
  check("platzhalter_werte", sql`${t.platzhalter} IS NULL OR ${t.platzhalter} IN ('alle_gf', 'offen')`),
]);
```

Hinweise:
- Kameraden anderer Ortswehren (z. B. der Gemeindesicherheitsbeauftragte) werden vorerst als externe Person geführt. Bei späterer Mehrmandantenfähigkeit können sie durch echte Kameraden-Bezüge ersetzt werden.
- `bereiche` und `kurztitel` sind optional. Der Plan funktioniert auch nur mit Titeln (bisherige Arbeitsweise).

## 5. Rhythmus-Logik

### 5.1 Typ `wochen_zyklus`
Index = `floor((datum − ankerDatum) / 7) mod länge(muster)` (mathematisches mod, auch vor dem Anker). Nur Daten am Regel-Wochentag.

Dienstabende: Dienstag, Anker 28.04.2026, Muster `['D','','D','Z']`.

| Datum | Index | Ergebnis | Ist 2026 |
|---|---|---|---|
| 21.04.2026 | 3 | Z | Z |
| 28.04.2026 | 0 | D | D |
| 05.05.2026 | 1 | frei | – |
| 12.05.2026 | 2 | D | D |
| 19.05.2026 | 3 | Z | Z |
| 08.12.2026 | 0 | D | D |
| 22.12.2026 | 2 | D | D |
| 29.12.2026 | 3 | Z | Z |

### 5.2 Typ `monats_wochentag`
n-ter Wochentag in den angegebenen Monaten. Festgelegt (11.11.2026): 3. Donnerstag, quartalsweise.
- Gruppenführerrunde: 3. Donnerstag in Feb, Mai, Aug, Nov (2026: 19.02., 21.05., 20.08., 19.11.)
- Ortskommando: 3. Donnerstag in Jan, Apr, Jul, Okt (2026: 15.01., 16.04., 16.07., 15.10.)

Gegenprobe mit den Plänen 2023–2026 (siehe 2.1): Gruppenführerrunde 15 von 16 Terminen am 3. Donnerstag (Ausnahme 22.05.2025). Ortskommando lag 2023–2025 überwiegend am 4. Donnerstag, seit April 2026 am 3. Donnerstag; Januar 2026 war ein Freitag (23.01.). Festgelegt (11.11.2026): beide am 3. Donnerstag. Abweichende Einzeltermine werden in der Sitzung verschoben.

### 5.2a Phasenwechsel bei Jahreswechsel
Die Analyse 2023–2026 zeigt: Dienstabende (D) laufen lückenlos im 14-Tage-Takt durch. Der Zwischendienst lag 2023–2025 eine Woche nach dem Dienstabend (Muster D, Z, D, frei), seit 2026 eine Woche vor dem Dienstabend (D, frei, D, Z). Ein solcher Wechsel muss beim Anlegen eines Jahres möglich sein:
- Beim Anlegen eines Plans zeigt das Tool eine Vorschau der Rhythmustermine (erste 8 Wochen) und bietet „Zwischendienst um 2 Wochen versetzen“ an.
- Technisch: neue Version der Regel mit `gueltigAb` = 01.01. des Planjahres; die alte Regel erhält `gueltigBis`. Der Generator verwendet je Datum die gültige Regel.

### 5.3 Generator `generiereTermine(planId)`
1. Für jede aktive Regel alle Treffer im Planjahr berechnen.
2. Termin mit `quelle = 'rhythmus'`, `regelId`, `rhythmusDatum` anlegen, sofern für (`regelId`, `rhythmusDatum`) noch keiner existiert (idempotent, mehrfach ausführbar).
3. Bestehende Termine werden nie überschrieben oder gelöscht. Verschobene Termine behalten `rhythmusDatum`, abgesagte werden `ausgefallen = true`.
4. Fällt ein Treffer auf einen gesetzlichen Feiertag in Niedersachsen, wird der Termin trotzdem angelegt und markiert (Hinweis, siehe 7.6). Ferien werden nicht berücksichtigt.

Akzeptanztest: Für 2026 erzeugt der Generator exakt die D-, Z- und G-Daten des bisherigen Plans sowie die O-Daten ab April (Januar 2026 wurde manuell auf Fr 23.01. gelegt). JHV-Termine belegen Dienstabend-Slots (03.03., 17.03.2026): Der Generator erzeugt dort D, die Kategorie wird in der Planung auf J geändert.

## 6. Rollen, Rechte, RLS

Neuer JWT-Claim `dienst_rolle` (analog `psa_rolle`, `food_rolle`), über `withScope` als `app.dienst_rolle` gesetzt.

| Rolle | Rechte |
|---|---|
| admin | alles, inkl. Kategorien, Rhythmusregeln, Freigabe, Rücksetzen auf Entwurf |
| planer (Gruppenführer) | Pläne im Entwurf bearbeiten, Kataloge pflegen, Vorschläge übernehmen/verwerfen; nach Freigabe Einzeländerungen (werden markiert, siehe 8) |
| mitglied (Standard) | freigegebene Pläne lesen, Themenvorschläge einreichen, eigene Vorschläge sehen |

RLS auf allen Tabellen in `dienstplan`, zusätzlich gefiltert nach `organisation_id`.

Präsentationsansicht: Der Fernseher im Schulungsraum soll ohne persönliches Login laufen. Lösung: zeitlich begrenzter Anzeige-Token (Gültigkeit z. B. 12 Stunden, nur Lesen, nur ein Plan), erzeugt aus der Eingabemaske als Link/QR-Code. Die Route muss bei einer globalen Auth-Middleware als Ausnahme gelistet werden (analog `/food`).

## 7. Oberfläche

### 7.1 Gestaltung
- Nutzt das bestehende FW-Hub-Design (inkl. Dunkelmodus), keine eigene Optik.
- Orientierung an Apple Human Interface Guidelines: ruhige Flächen, viel Weißraum, klare Typohierarchie, abgerundete Karten, dezente Schatten.
- Kategoriefarben als Tokens aus Apples Systemfarben, jeweils mit Hell- und Dunkelvariante. Karten mit leicht getöntem Hintergrund (ca. 10–15 % Deckkraft) und farbigem Akzentstreifen links, keine vollflächigen Farben.

| Token | Hell | Dunkel | Vorschlag |
|---|---|---|---|
| blue | #007AFF | #0A84FF | D Dienstabend |
| teal | #30B0C7 | #40C8E0 | Z Zwischendienst |
| orange | #FF9500 | #FF9F0A | G Gruppenführerrunde |
| indigo | #5856D6 | #5E5CE6 | O Ortskommando |
| pink | #FF2D55 | #FF375F | K Kameradschaft |
| purple | #AF52DE | #BF5AF2 | J Jahreshauptversammlung |
| red | #FF3B30 | #FF453A | B Brandschutz etc. (Osterfeuer) |
| yellow | #FFCC00 | #FFD60A | (Reserve) |
| green | #34C759 | #30D158 | frei |
| gray | #8E8E93 | #8E8E93 | ausgefallen (bisher F) |

- Schrift: Inter (Open Source, SIL OFL, sehr nah an Apples SF Pro). SF Pro darf laut Lizenz nicht außerhalb von Apple-Plattformen eingesetzt werden; für Web, PDF und Bild daher Inter.
- Farbe nie als einziges Unterscheidungsmerkmal: Kürzel bleibt überall sichtbar.

### 7.2 Eingabemaske (Laptop, `/dienstplan/[jahr]/bearbeiten`)
- Hauptbereich: Termine als Liste, gruppiert nach Monat, kompakt; Umschalter Liste / Monatsraster.
- Seitenleiste mit Reitern:
  - Themen: Suche, Filter nach Bereich, Filter „im Jahr noch nicht verplant“, Anzeige „zuletzt am …“.
  - Blöcke.
  - Pool: offene Themenvorschläge mit Einreicher und Datum; „Als Thema übernehmen“ oder direkt auf Termin ziehen.
  - Personen: aktive Kameraden (Anzeigename) und externe Personen; „Externe Person anlegen“. Bei jeder Person die Anzahl Einteilungen im Plan.
  - Ausgleich: eigener Block für die Gruppenführer (Tabelle `ausgleich_personen`) mit Anzahl Einteilungen im Plan, Durchschnitt der Gruppe und Abweichung (z. B. „Bruns 3 · Ø 4,2“). Wer deutlich unter dem Durchschnitt liegt, steht oben. Optional Vergleich mit dem Vorjahr. Zählung: jede Themenposition mit der Person als Verantwortlichem zählt einmal; Kameradschaftstermine (K) und Gremien (G, O) zählen nicht.
- Drag and Drop (dnd-kit), zusätzlich vollständig per Klick bedienbar:

| Quelle | Ziel | Wirkung |
|---|---|---|
| Thema / Vorschlag | Termin | neue Themenposition am Ende (Vorschlag wird `uebernommen`) |
| Block | Termin | alle Themen des Blocks, `ausBlockId` gesetzt |
| Themenposition | anderer Termin | verschieben inkl. Verantwortlicher; mit Alt-Taste kopieren |
| Themenposition | gleicher Termin | Reihenfolge ändern |
| Person | Themenposition | als Verantwortlicher hinzufügen |
| Terminkarte | anderes Datum (Monatsraster) | Datum ändern |

- Rückgängig/Wiederholen (Strg+Z / Strg+Y) für die letzten Aktionen in der Sitzung.
- Vorjahresanzeige: Auf jedem Termin wird das Thema des Vorjahres blass im Hintergrund angezeigt (z. B. hellgraue Kursivschrift „2026: Pumpenkunde, Wasserförderung“), damit man sieht, was beim letzten Mal dran war. Zuordnung: Termin gleicher Kategorie am Datum minus 364 Tage (52 Wochen). Weil der Dienstrhythmus 4 Wochen beträgt und 52 = 13 × 4 ist, trifft das immer denselben Platz im Rhythmus und denselben Wochentag. Für Sondertermine ohne Treffer: nächster Termin gleicher Kategorie im Abstand von höchstens ±14 Tagen. Ein Schalter blendet die Anzeige aus. Auch in der Präsentationsansicht verfügbar (Standard: aus).
- Schalter „Fokus“: markiert den gerade bearbeiteten Termin auch in der Präsentationsansicht.

### 7.3 Präsentationsansicht (Fernseher, `/dienstplan/[jahr]/praesentation`)
- Nur Anzeige, keine Bedienelemente, optimiert für 1920 × 1080 und 3840 × 2160, große Schrift.
- Halbjahr als Standard (6 Monatsspalten), umschaltbar auf Gesamtjahr.
- Termine als Karten mit Datum, Wochentag, Uhrzeit, Themen, Verantwortlichen.
- Live-Aktualisierung: Polling alle 2 Sekunden auf `plaene.version` (ETag, leichte Antwort bei keiner Änderung). Einfacher und robuster hinter Cloudflare als Server-Sent Events; SSE als spätere Option.
- Geänderte Karten werden kurz hervorgehoben (ca. 3 Sekunden), der Fokus-Termin dauerhaft, bis er wechselt.
- Kopfzeile: Plan, Status (Entwurf/Freigegeben), Zähler „Dienstabende ohne Thema: n“.

### 7.4 Mitgliederansicht (`/dienstplan`)
- Desktop: Liste nach Monaten, aktuelle Woche hervorgehoben, vergangene Termine abgeblendet.
- Mobil: nur Liste, nächster Termin oben.
- Links zu: iCal-Abo, PDF, Bild für das Halbjahr.
- Eingabefeld „Themenvorschlag einreichen“ (Titel, optional Beschreibung).

### 7.5 Verwaltung (admin)
Kategorien, Rhythmusregeln (mit Vorschau der nächsten 12 Treffer), Bereiche, Themen, Blöcke, externe Personen.

### 7.6 Hinweise (nicht blockierend)
- Pflichtthema fehlt im Plan (`pflichtJaehrlich = true` und kein Termin im Planjahr). Anzeige dauerhaft oben in der Eingabemaske und in der Präsentationsansicht, bis alle Pflichtthemen eingeplant sind. Seed: Sicherheitsunterweisung, Erste Hilfe, Atemschutzunterweisung (Zielgruppe Atemschutzgeräteträger).
- Dienstabend ohne Thema.
- Themenposition eines Dienstabends ohne Verantwortliche.
- Termin fällt auf einen gesetzlichen Feiertag in Niedersachsen (Berechnung lokal, z. B. Bibliothek `feiertagejs`, keine externe API).
- Person ist am selben Tag mehrfach eingeplant.

### 7.7 Themenkatalog-Auswertung (optional, Phase 7)
- Je Thema: zuletzt durchgeführt, Anzahl in den letzten 3 Jahren.
- Je Plan: Verteilung der Dienstabende nach Bereich (einfaches Balkendiagramm). Ziel: sehen, ob ein Bereich zu kurz kommt.

## 8. Freigabe und Änderungen unterm Jahr

- Freigabe durch admin setzt `status = freigegeben`, `freigegebenAm`, `freigegebenVon` und legt automatisch eine Version in `plan_versionen` an.
- Zusätzlich kann jederzeit manuell eine Version gespeichert werden (z. B. „Stand nach GF-Sitzung“).
- Versionsverlauf: Liste aller Versionen eines Plans; jede Version ist schreibgeschützt ansehbar; Vergleich zweier Versionen (Termine neu, entfallen, verschoben, Thema oder Verantwortliche geändert). Wiederherstellen (nur admin) übernimmt den Stand einer Version als neuen Entwurf, ohne Versionen zu löschen.
- Änderungen nach Freigabe (planer oder admin) werden im Changelog protokolliert.
- Markierung „geändert“ wird durch Vergleich mit der letzten Freigabe-Version berechnet, nicht gespeichert. Darstellung: kleiner Punkt bzw. „geändert am TT.MM.“ in grauer Kleinschrift an der Karte, im Export optional als Fußnote. Keine auffälligen Markierungen.
- Exporte tragen immer „Stand: TT.MM.JJJJ“.
- iCal-Feed liefert geänderte Termine mit erhöhter `SEQUENCE`, damit Kalender-Apps sie aktualisieren.

## 9. Ausgaben

### 9.1 Excel (exceljs, serverseitig)
- Blatt je Halbjahr plus Gesamtblatt.
- Spalten: Datum (TT.MM.JJJJ) | Wochentag | Kürzel | Uhrzeit | Thema | Verantwortlich.
- Zeilenhintergrund: Kategoriefarbe als helle Tönung (ca. 20 %), Schrift dunkel; Kürzelzelle in voller Kategoriefarbe.
- A4 hoch, an Seitenbreite angepasst, Kopfzeile wiederholt, Legende unter der Tabelle, Fußzeile mit Stand.

### 9.2 PDF (@react-pdf/renderer, serverseitig)
- A4 hoch zum Ausdrucken und Verteilen, je Halbjahr eine Seite (bei Bedarf Umbruch).
- Kopf: Logo (Platzhalter, später Vektordatei als SVG), Titel „Dienstplan 2027 – 1. Halbjahr“, Stand.
- Tabelle wie Excel, Kategoriefarbe als schmaler Streifen am Zeilenanfang (druckerfreundlich, wenig Toner).
- Legende und Seitenzahl im Fuß. Inter eingebettet.

### 9.3 Bild für Smartphone (PNG, serverseitig mit satori + resvg)
- Je Halbjahr ein Bild im Hochformat, 1290 × 2796 px (passt auf aktuelle iPhones und die meisten Android-Geräte).
- Oben ca. 15 % frei (Uhrzeit/Widgets des Sperrbildschirms), unten ca. 10 % frei.
- Kompakte Darstellung: Datum, Kürzel, Kurztitel (falls vorhanden), keine oder gekürzte Verantwortliche (umschaltbar), damit es lesbar bleibt.
- Hell und dunkel als Variante.
- satori + resvg kommen ohne Headless-Browser im Container aus.

### 9.4 iCal
Bisheriger Ablauf: .ics-Datei wird in einen freigegebenen Google-Kalender importiert, den die Mitglieder abonniert haben. Das bleibt der primäre Weg.
- .ics-Download für Jahr oder Halbjahr, optional gefiltert nach Kategorien.
- Jeder Termin hat eine stabile UID (`dienstplan-<terminId>@ofwietmarschen.org`), damit ein erneuter Import denselben Termin wiedererkennen kann. Ob der Google-Kalender-Import bestehende Termine anhand der UID aktualisiert oder Dubletten erzeugt, ist vor dem ersten Einsatz mit einem Testkalender zu prüfen.
- Wie beim CSV-Export: Modus „nur Änderungen seit letztem Export“.
- Abo-URL mit geheimem Token (nur freigegebene Pläne); Token im Admin-Bereich neu erzeugbar. Die URL muss öffentlich erreichbar sein (portal.ofwietmarschen.org), damit externe Dienste sie abrufen können; Route als Ausnahme von der Auth-Middleware, Schutz nur über das Token.
- DIVERA bietet neben CSV einen ICS-Import per Link (Termine → ICS-Kalender importieren; berücksichtigt nur Termine der nächsten 18 Monate). Damit kann dieselbe Abo-URL sowohl für Google als auch für DIVERA dienen. Zu testen: ob DIVERA den Link einmalig lädt oder regelmäßig aktualisiert, und ob bei erneutem Laden Termine anhand der UID aktualisiert oder doppelt angelegt werden. Je nach Ergebnis ist ICS-Link oder CSV der bevorzugte Weg nach DIVERA.
- Ende = Beginn + `dauerMinuten` (bzw. Standarddauer der Kategorie). Termine ohne Uhrzeit als Ganztagstermin.

### 9.5 CSV (Exportprofile)
- Grundlage: Beginn (Datum, Uhrzeit) und Dauer. Alle weiteren Zeitfelder werden berechnet. Verfügbare Felder je Termin:

| Feld | Beispiel |
|---|---|
| startDatum, startZeit | 09.06.2026, 19:30 |
| endeDatum, endeZeit | 09.06.2026, 21:30 (über Mitternacht korrekt) |
| startIso, endeIso | 2026-06-09T19:30:00+02:00 |
| ganztaegig | 0/1 |
| titel | „AT / ELW-Gruppe / FwDv3 / Maschinisten“ |
| verantwortliche | „Möller, J. / Bruns / Schmits / Heilemann, T.“ |
| beschreibung | Themen und Verantwortliche als mehrzeiliger Text |
| kategorieKuerzel, kategorieName | D, Dienstabend |
| ort, bemerkung | |
| terminId | stabile ID (für Abgleich bei erneutem Import, falls das Zielsystem das unterstützt) |

- Spaltenfolge, Überschriften, Datums-/Zeitformat, Trennzeichen und Kodierung legt das Exportprofil fest (Verwaltung, admin). Damit lässt sich das DIVERA-Format ohne Codeänderung abbilden.
- Profil „DIVERA 24/7“ (Seed). Bekannt aus der DIVERA-Importmaske (Termine → CSV-Kalender importieren): akzeptiert csv, xls, ods; erkennt automatisch die Spaltenüberschriften `Datum`, `Von`/`Bis` (nur Uhrzeit), `Beginn`/`Ende` (Datum + Uhrzeit), `Titel`, `Text`, `Ort`, `Empfänger`; bei abweichenden Überschriften manuelle Zuordnung möglich. Vorlagen: divera247.com/downloads/divera247-terminimport.csv bzw. .xlsx.
  Standardbelegung des Profils:

  | Überschrift | Feld | Format |
  |---|---|---|
  | Datum | startDatum | TT.MM.JJJJ |
  | Von | startZeit | HH:MM |
  | Bis | endeZeit | HH:MM |
  | Titel | titel (bei Dienstabenden mit Kürzel-Präfix optional, z. B. „Dienst: …“) | |
  | Text | beschreibung (Themen mit Verantwortlichen, mehrzeilig) | |
  | Ort | ort | |
  | Empfänger | leer bzw. fester Wert je Kategorie (Format in DIVERA prüfen) | |

  Termine über Mitternacht: statt `Datum`/`Von`/`Bis` die Spalten `Beginn`/`Ende` verwenden (Profilvariante). Exakte Datums-/Zeitformate, Trennzeichen und Kodierung vor Phase 10 mit der DIVERA-Vorlage abgleichen. Der DIVERA-Export ist Pflichtbestandteil von Release 1, weil der Plan sonst von Hand in DIVERA übertragen werden müsste.
- Ausgefallene Termine werden nicht exportiert.
- Exportmodi:
  - Komplett: alle Termine des Plans bzw. Halbjahres.
  - Nur Änderungen: alle Termine, die seit dem letzten Export mit diesem Profil neu sind oder deren exportierte Felder sich geändert haben (Vergleich über Prüfsumme in `export_laeufe.stand`). Zusätzlich zeigt das Tool eine Liste „In DIVERA löschen“ mit den entfallenen bzw. geänderten Altterminen (Datum, Uhrzeit, alter Titel), damit sie im Zielsystem von Hand entfernt werden können.
- Jeder Export wird in `export_laeufe` protokolliert. Ein Export im Modus „Nur Änderungen“ ohne vorherigen Lauf verhält sich wie „Komplett“.

## 9a. Erinnerungen an Verantwortliche

- Täglicher Job (Cron im Container oder bestehender Poller), prüft Termine in `tageVorher` Tagen (Standard 14 und 3) und versendet an alle Verantwortlichen der jeweiligen Themenposition.
- Inhalt: Datum, Uhrzeit, Thema, Mitverantwortliche, Notizen, Link zum Termin im Portal.
- Idempotent über `erinnerungs_versand` (keine Doppelversände bei Neustart). Fehler werden protokolliert und im Admin-Bereich angezeigt.
- Nur freigegebene Pläne, keine ausgefallenen Termine. Bei Änderung von Datum oder Verantwortlichen nach einem Versand: neue Erinnerung mit Hinweis „geändert“.
- Kanäle, in dieser Reihenfolge prüfen und umsetzen:
  1. E-Mail (SMTP, z. B. über den bestehenden M365-Tenant). Voraussetzung: E-Mail-Adresse in der Mitgliederverwaltung.
  2. DIVERA 24/7: prüfen, ob die DIVERA-API das Anlegen von Terminen oder gezielte Mitteilungen an einzelne Personen erlaubt. Falls ja, ist das der naheliegende Kanal, weil alle die App ohnehin nutzen, und könnte auch den CSV-Umweg ersetzen.
  3. WhatsApp nur über die offizielle WhatsApp Business Platform (Cloud API von Meta): erfordert Meta-Business-Konto, eigene Telefonnummer, freigegebene Nachrichtenvorlagen und ist pro Nachricht kostenpflichtig. Inoffizielle Bibliotheken (whatsapp-web.js, Baileys u. ä.) verstoßen gegen die Nutzungsbedingungen und riskieren die Sperrung der Nummer, daher ausgeschlossen.
- Abmeldung je Person möglich (Einstellung im Profil).

## 10. Datenübernahme

Einmaliges Importskript für die bestehende Excel-Datei:
Quelle: Dienstplan_2026.xlsx, Blätter „Dienstplan 2023“ bis „Dienstplan 2026“ (einheitliches Format). Ältere Pläne (Blatt „2022“ und ggf. weitere Dateien) ohne Typ-Spalte werden optional mit importiert; die Kategorie wird dann aus dem Titel abgeleitet (Zwischendienst → Z, Ortskommando → O, Gruppenführerrunde → G, JHV → J, bekannte K-Termine wie Weihnachtsfeier → K, sonst D) und in der Vorschau zur Prüfung angezeigt. „GF 2022“ und „2022 (Corona Spezial)“ werden nicht importiert. Das Blatt „Themen“ (78 Einträge) dient als Startkatalog, „Diensttypen“ als Kategorien-Seed, „Gruppenführer“ (17 Namen) als Seed für `ausgleich_personen`.

0. Typ-Kürzel normalisieren (2024/2025 klein geschrieben), Typ F als ausgefallenen Termin übernehmen, Spalte „Option wg. Umbau“ in `ort` übernehmen, Spalte „Küchendienst“ ignorieren (nie befüllt).
1. Themenkatalog aus allen Themen (an „ / “ getrennt) aufbauen, Dubletten und Schreibvarianten zusammenführen (z. B. „AT / ELW-Gruppe / FwDv3 / Maschinisten“, „AT-Unterweisung / ELW-Gruppe / …“, „AT / Maschinisten / ELW-Gruppe / FwDv3“ → ein Block). Vorschlagsliste zur manuellen Bestätigung.
1a. Verantwortliche: „Gruppenführer“ und „GF“ → Platzhalter `alle_gf`; „n.n.“ und „???“ → `offen`; Organisationen ohne Person („DRK“, „THW“, „OF Lohne“) → externe Person mit Organisation und leerem Personennamen. Trennzeichen uneinheitlich („/“, „, “, „/ “): Trennung an „/“, Komma nur als Trenner werten, wenn kein Initial folgt („Möller, J.“ bleibt eine Person).
2. Wiederkehrende Themenkombinationen als Blockvorschläge ausgeben (manuell bestätigen).
3. Verantwortliche gegen `core.kameraden` abgleichen (Nachname, Initiale, Spitzname); nicht zuordenbare Einträge als Liste zur Klärung (Kamerad, externe Person oder Spitzname nachtragen).
4. Pläne 2023–2026 als freigegebene Pläne importieren (Referenz für Generator-Test, Vorjahresanzeige, „zuletzt durchgeführt“ und Ausgleichsvergleich über mehrere Jahre).

## 11. Umsetzungsphasen

Die Phasen sind die technische Bauweise, keine schrittweise Einführung. Den Nutzern (Gruppenführer, Mitglieder) wird das Modul erst gezeigt, wenn Release 1 vollständig fertig und mit echten Daten getestet ist.

Release 1 (Voraussetzung für die erste Planungssitzung): Phasen 1 bis 11.
Release 2 (danach): Erinnerungen, Katalog-Auswertung.

Bauweise:

1. Core-Migration (Spitzname, Anzeigename-Funktion mit Tests) – nutzt allen Modulen.
2. Schema `dienstplan`, Migration, RLS, Claim `dienst_rolle`, Seeds (Kategorien, Regeln, Organisation).
3. API inkl. Generator und Akzeptanztest 2026.
4. Importskript für den Plan 2026 (Themenkatalog, Blockvorschläge, Verantwortliche, Plan 2026 als Referenz). Früh, weil Vorjahresanzeige, Katalog und alle weiteren Tests echte Daten brauchen.
5. Eingabemaske (Klickbedienung), Verwaltung, Feiertagshinweise.
6. Präsentationsansicht mit Live-Aktualisierung und Anzeige-Token.
7. Drag and Drop, Rückgängig, Vorjahresanzeige.
8. Themenpool, Pflichtthemen-Hinweis, Ausgleichsanzeige, Mitgliederansicht.
9. Versionen (Freigabe, manuell, Vergleich, Wiederherstellen).
10. Exporte: CSV-Profile inkl. DIVERA und Änderungsexport, .ics mit stabilen UIDs, Excel.
11. PDF, Bild für Smartphone.
--- Release 1 ---
12. Erinnerungen (E-Mail).
13. Katalog-Auswertung.

Zieltermin: Planungssitzung am 19.11.2026 (Gruppenführerrunde = Dienstplanerstellung). Falls die Zeit nicht reicht, wird 2027 noch klassisch in Excel geplant und anschließend importiert.
Für die Sitzung selbst zwingend: Phasen 1–8 (Daten, Eingabe, Präsentation, Drag and Drop, Vorjahresanzeige, Pool, Pflichtthemen, Ausgleich). Phasen 9–11 (Versionen, Exporte, PDF, Bild) werden erst nach der Sitzung für die Verteilung gebraucht und sind für die Gruppenführer in der Sitzung nicht sichtbar; sie können notfalls in den Tagen danach fertiggestellt werden.

Abnahme Release 1: Ben spielt die Planung 2027 einmal komplett im Probelauf durch (Eingabe am Laptop, Präsentation auf zweitem Bildschirm, alle Exporte inkl. Import in einen DIVERA- bzw. Google-Testbereich). Erst danach Vorführung vor den Gruppenführern.

## 12. Offene Punkte

- Mehrmandantenfähigkeit: Wird `core.organisationen` FW-Hub-weit eingeführt (Bezug von `core.kameraden`, Benutzer, Rollen)? Dienstplan ist vorbereitet, die Entscheidung betrifft alle Module.
- Themenvorschläge: Dürfen alle Mitglieder einreichen (Annahme: ja) oder nur Gruppenführer?
- Logo als SVG nachliefern.
- DIVERA 24/7: Spaltenüberschriften bekannt (9.5); offen sind exakte Formate laut Vorlage, Bedeutung/Format der Spalte `Empfänger` und das Verhalten des ICS-Link-Imports bei Änderungen (9.4).
- Excel-Datei 2026 für Importskript nachliefern.
- Standarddauern je Kategorie festlegen (Annahme: Dienstabend 2 h, Gremien 2 h, Kameradschaft 4 h).
- Zielgruppe bei Pflichtthemen: nur Hinweis (Annahme) oder später Abgleich mit einer Qualifikation „Atemschutzgeräteträger“ aus der Mitgliederverwaltung?

## 13. Spätere Ideen (nicht Teil dieser Spec)

- Abwesenheiten: Personen (v. a. Gruppenführer) tragen Urlaub/Abwesenheit ein; Hinweis, wenn sie an diesem Datum eingeteilt werden.
- DIVERA-API statt CSV: Termine direkt anlegen/aktualisieren, falls die API das unterstützt.
- Direkter Abgleich mit dem freigegebenen Google-Kalender über die Google-Calendar-API statt .ics-Import.
- Weitere Erinnerungskanäle (DIVERA-Mitteilung, ggf. WhatsApp Business Platform).
- Anwesenheit per RFID-Karte (eher im Rahmen eines Dienstbuch-Moduls).
- Fremdtermine (Kreis, Lehrgänge) als Einblendung.

Bewusst verworfen: Bestätigung der Themen durch Verantwortliche, öffentliche Fassung für die Homepage, eigene Kategorie für Gemeindetermine (einziger Gemeindetermin ist die JHV der Gemeindewehr, Kategorie J).
