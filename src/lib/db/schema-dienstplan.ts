import {
  pgSchema,
  serial,
  integer,
  text,
  date,
  time,
  boolean,
  timestamp,
  smallint,
  jsonb,
  check,
  unique,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { kameraden } from "./schema";

// ============================================================================
// DIENSTPLAN — Jahresdienstplan (Spec: docs/dienstplan/DIENSTPLAN_SPEC.md, 4.3).
// RLS auf allen Tabellen (Migration 0018): app.dienst_rolle (Admin | Planer |
// Mitglied) und app.dienst_org (organisation_id), gesetzt von
// withDienstplanScope (lib/db/scoped.ts). Personenbezug nur über kamerad_id;
// Namen liest das Modul über dienstplan.kameraden_namen() (keine Leserechte auf
// core.kameraden). Zeitstempel mit Zeitzone wie im übrigen Schema.
// ============================================================================
export const dp = pgSchema("dienstplan");

export const dpPlanStatus = dp.enum("plan_status", ["entwurf", "freigegeben"]);
export const dpTerminQuelle = dp.enum("termin_quelle", ["rhythmus", "manuell"]);
export const dpRegelTyp = dp.enum("regel_typ", ["wochen_zyklus", "monats_wochentag"]);
export const dpVorschlagStatus = dp.enum("vorschlag_status", ["offen", "uebernommen", "verworfen"]);

// Farb-Tokens der Kategorien (Spec 7.1). Die Werte stehen als Token in
// globals.css, nie als Hex in Komponenten.
export const DP_FARBEN = [
  "blue", "teal", "orange", "indigo", "pink", "purple", "red", "yellow", "green", "gray",
] as const;

// Bis core.organisationen FW-Hub-weit entschieden ist (Spec 4.1, offene Punkte),
// gibt es hier genau eine Organisation (Seed id 1). Alle organisation_id im
// Schema verweisen darauf; ein späterer Umzug ändert nur diesen Bezug.
export const dpOrganisationen = dp.table("organisationen", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const dpKategorien = dp.table("kategorien", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  kuerzel: text("kuerzel").notNull(),
  name: text("name").notNull(),
  farbe: text("farbe").notNull(),
  standardUhrzeit: time("standard_uhrzeit"),
  standardDauerMinuten: smallint("standard_dauer_minuten").notNull().default(120),
  sortierung: smallint("sortierung").notNull().default(0),
  aktiv: boolean("aktiv").notNull().default(true),
}, (t) => [
  unique("kategorien_org_kuerzel").on(t.organisationId, t.kuerzel),
  check("kategorien_farbe", sql`${t.farbe} IN ('blue','teal','orange','indigo','pink','purple','red','yellow','green','gray')`),
  check("kategorien_dauer", sql`${t.standardDauerMinuten} > 0`),
]);

export const dpRhythmusRegeln = dp.table("rhythmus_regeln", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  name: text("name").notNull(),
  typ: dpRegelTyp("typ").notNull(),
  wochentag: smallint("wochentag").notNull(), // ISO: 1 = Mo … 7 = So
  uhrzeit: time("uhrzeit").notNull(),
  // typ = wochen_zyklus
  ankerDatum: date("anker_datum"),
  muster: text("muster").array(), // Kategorie-Kürzel je Woche, '' = frei
  // typ = monats_wochentag
  nterWochentag: smallint("nter_wochentag"), // 1–5, -1 = letzter
  monate: smallint("monate").array(),
  kategorieKuerzel: text("kategorie_kuerzel"),
  gueltigAb: date("gueltig_ab").notNull(),
  gueltigBis: date("gueltig_bis"),
  aktiv: boolean("aktiv").notNull().default(true),
}, (t) => [
  check("regeln_wochentag", sql`${t.wochentag} BETWEEN 1 AND 7`),
  check("regeln_gueltig", sql`${t.gueltigBis} IS NULL OR ${t.gueltigBis} >= ${t.gueltigAb}`),
  check("regeln_wochen_zyklus", sql`${t.typ} <> 'wochen_zyklus' OR (${t.ankerDatum} IS NOT NULL AND cardinality(${t.muster}) >= 1)`),
  check("regeln_monats_wochentag", sql`${t.typ} <> 'monats_wochentag' OR (${t.nterWochentag} IN (1,2,3,4,5,-1) AND cardinality(${t.monate}) >= 1 AND ${t.kategorieKuerzel} IS NOT NULL)`),
]);

export const dpPlaene = dp.table("plaene", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  jahr: integer("jahr").notNull(),
  status: dpPlanStatus("status").notNull().default("entwurf"),
  version: integer("version").notNull().default(0), // bei jeder Änderung erhöht (Trigger)
  freigegebenAm: timestamp("freigegeben_am", { withTimezone: true }),
  freigegebenVon: integer("freigegeben_von").references(() => kameraden.id),
}, (t) => [
  unique("plaene_org_jahr").on(t.organisationId, t.jahr),
  check("plaene_jahr", sql`${t.jahr} BETWEEN 2000 AND 2100`),
]);

export const dpTermine = dp.table("termine", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => dpPlaene.id, { onDelete: "cascade" }),
  datum: date("datum").notNull(),
  uhrzeit: time("uhrzeit"),
  dauerMinuten: smallint("dauer_minuten"), // null = Standarddauer der Kategorie
  kategorieId: integer("kategorie_id").notNull().references(() => dpKategorien.id),
  quelle: dpTerminQuelle("quelle").notNull().default("manuell"),
  regelId: integer("regel_id").references(() => dpRhythmusRegeln.id),
  rhythmusDatum: date("rhythmus_datum"),
  ausgefallen: boolean("ausgefallen").notNull().default(false),
  ort: text("ort"),
  bemerkung: text("bemerkung"),
  notizen: text("notizen"),
  aktualisiertAm: timestamp("aktualisiert_am", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_termine_plan_datum").on(t.planId, t.datum),
  // Generator idempotent: je Regel und Rhythmusdatum höchstens ein Termin.
  uniqueIndex("idx_termine_regel_rhythmus").on(t.planId, t.regelId, t.rhythmusDatum).where(sql`${t.regelId} IS NOT NULL`),
  check("termine_rhythmus", sql`${t.quelle} <> 'rhythmus' OR (${t.regelId} IS NOT NULL AND ${t.rhythmusDatum} IS NOT NULL)`),
  check("termine_dauer", sql`${t.dauerMinuten} IS NULL OR ${t.dauerMinuten} > 0`),
]);

export const dpPlanVersionen = dp.table("plan_versionen", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => dpPlaene.id, { onDelete: "cascade" }),
  nummer: integer("nummer").notNull(),
  anlass: text("anlass").notNull(),
  bezeichnung: text("bezeichnung"),
  inhalt: jsonb("inhalt").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
  erstelltVon: integer("erstellt_von").notNull().references(() => kameraden.id),
}, (t) => [
  unique("plan_versionen_plan_nummer").on(t.planId, t.nummer),
  check("plan_versionen_anlass", sql`${t.anlass} IN ('freigabe', 'manuell')`),
]);

export const dpBereiche = dp.table("bereiche", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  name: text("name").notNull(),
  sortierung: smallint("sortierung").notNull().default(0),
}, (t) => [unique("bereiche_org_name").on(t.organisationId, t.name)]);

export const dpThemen = dp.table("themen", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  titel: text("titel").notNull(),
  kurztitel: text("kurztitel"),
  bereichId: integer("bereich_id").references(() => dpBereiche.id),
  notizen: text("notizen"),
  pflichtJaehrlich: boolean("pflicht_jaehrlich").notNull().default(false),
  zielgruppe: text("zielgruppe"),
  aktiv: boolean("aktiv").notNull().default(true),
}, (t) => [unique("themen_org_titel").on(t.organisationId, t.titel)]);

export const dpThemenbloecke = dp.table("themenbloecke", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  name: text("name").notNull(),
  aktiv: boolean("aktiv").notNull().default(true),
});

export const dpThemenblockPositionen = dp.table("themenblock_positionen", {
  id: serial("id").primaryKey(),
  blockId: integer("block_id").notNull().references(() => dpThemenbloecke.id, { onDelete: "cascade" }),
  themaId: integer("thema_id").notNull().references(() => dpThemen.id),
  position: smallint("position").notNull(),
}, (t) => [index("idx_themenblock_positionen_block").on(t.blockId, t.position)]);

export const dpThemenvorschlaege = dp.table("themenvorschlaege", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),
  vorgeschlagenVon: integer("vorgeschlagen_von").notNull().references(() => kameraden.id),
  vorgeschlagenAm: timestamp("vorgeschlagen_am", { withTimezone: true }).notNull().defaultNow(),
  status: dpVorschlagStatus("status").notNull().default("offen"),
  themaId: integer("thema_id").references(() => dpThemen.id),
});

export const dpExternePersonen = dp.table("externe_personen", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  name: text("name"),
  organisation: text("organisation"),
  funktion: text("funktion"),
  email: text("email"), // nur für Planer/Admin ausgeben (Projektion in der App)
  aktiv: boolean("aktiv").notNull().default(true),
}, (t) => [
  check("name_oder_organisation", sql`num_nonnulls(${t.name}, ${t.organisation}) >= 1`),
]);

export const dpAusgleichPersonen = dp.table("ausgleich_personen", {
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  kameradId: integer("kamerad_id").notNull().references(() => kameraden.id),
}, (t) => [unique("ausgleich_personen_org_kamerad").on(t.organisationId, t.kameradId)]);

export const dpExportProfile = dp.table("export_profile", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => dpOrganisationen.id),
  name: text("name").notNull(),
  trennzeichen: text("trennzeichen").notNull().default(";"),
  kodierung: text("kodierung").notNull().default("utf-8-bom"),
  kopfzeile: boolean("kopfzeile").notNull().default(true),
  spalten: jsonb("spalten").notNull(),
  nurFreigegeben: boolean("nur_freigegeben").notNull().default(true),
  kategorien: text("kategorien").array(),
}, (t) => [
  check("export_profile_kodierung", sql`${t.kodierung} IN ('utf-8', 'utf-8-bom', 'windows-1252')`),
]);

export const dpExportLaeufe = dp.table("export_laeufe", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => dpPlaene.id, { onDelete: "cascade" }),
  profilId: integer("profil_id").notNull().references(() => dpExportProfile.id),
  modus: text("modus").notNull(),
  stand: jsonb("stand").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
  erstelltVon: integer("erstellt_von").notNull().references(() => kameraden.id),
}, (t) => [
  check("export_laeufe_modus", sql`${t.modus} IN ('komplett', 'aenderungen')`),
]);

export const dpErinnerungsEinstellungen = dp.table("erinnerungs_einstellungen", {
  organisationId: integer("organisation_id").primaryKey().references(() => dpOrganisationen.id),
  aktiv: boolean("aktiv").notNull().default(false),
  tageVorher: smallint("tage_vorher").array().notNull().default(sql`'{14,3}'`),
  kanaele: text("kanaele").array().notNull().default(sql`'{email}'`),
});

export const dpTerminThemen = dp.table("termin_themen", {
  id: serial("id").primaryKey(),
  terminId: integer("termin_id").notNull().references(() => dpTermine.id, { onDelete: "cascade" }),
  themaId: integer("thema_id").references(() => dpThemen.id),
  titelFreitext: text("titel_freitext"),
  position: smallint("position").notNull(),
  ausBlockId: integer("aus_block_id").references(() => dpThemenbloecke.id),
}, (t) => [
  index("idx_termin_themen_termin").on(t.terminId, t.position),
  check("thema_oder_freitext", sql`(${t.themaId} IS NOT NULL) <> (${t.titelFreitext} IS NOT NULL)`),
]);

export const dpTerminVerantwortliche = dp.table("termin_verantwortliche", {
  id: serial("id").primaryKey(),
  terminThemaId: integer("termin_thema_id").notNull().references(() => dpTerminThemen.id, { onDelete: "cascade" }),
  kameradId: integer("kamerad_id").references(() => kameraden.id),
  externePersonId: integer("externe_person_id").references(() => dpExternePersonen.id),
  platzhalter: text("platzhalter"), // nur Altdaten: alle_gf | offen; in der UI nicht auswählbar
  position: smallint("position").notNull(),
}, (t) => [
  index("idx_termin_verantwortliche_thema").on(t.terminThemaId, t.position),
  check("genau_ein_bezug", sql`num_nonnulls(${t.kameradId}, ${t.externePersonId}, ${t.platzhalter}) = 1`),
  check("platzhalter_werte", sql`${t.platzhalter} IS NULL OR ${t.platzhalter} IN ('alle_gf', 'offen')`),
]);

export const dpErinnerungsVersand = dp.table("erinnerungs_versand", {
  id: serial("id").primaryKey(),
  terminVerantwortlicherId: integer("termin_verantwortlicher_id").notNull().references(() => dpTerminVerantwortliche.id, { onDelete: "cascade" }),
  tageVorher: smallint("tage_vorher").notNull(),
  kanal: text("kanal").notNull(),
  gesendetAm: timestamp("gesendet_am", { withTimezone: true }),
  fehler: text("fehler"),
}, (t) => [unique("erinnerungs_versand_eindeutig").on(t.terminVerantwortlicherId, t.tageVorher, t.kanal)]);
