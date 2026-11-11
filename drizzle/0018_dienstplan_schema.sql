-- Modul Dienstplan: Schema dienstplan mit RLS, Trigger, Namensfunktion und Seeds.
-- ADDITIV (neues Schema, core unverändert).
--
-- Spec: docs/dienstplan/DIENSTPLAN_SPEC.md, Abschnitte 4.3 und 6.
-- Der erste Teil (CREATE SCHEMA/TYPE/TABLE, Fremdschlüssel, Indizes) entspricht
-- dem Drizzle-Schema src/lib/db/schema-dienstplan.ts (Snapshot). Der zweite Teil
-- ab "Handteil" ist von Hand ergänzt.
--
-- Rollen (app.dienst_rolle, gesetzt von withDienstplanScope):
--   Admin    alles, inkl. Kategorien, Regeln, Plan anlegen, Freigabe, Rücksetzen
--   Planer   Termine/Themen/Verantwortliche bearbeiten (auch nach Freigabe),
--            Kataloge und externe Personen pflegen, Vorschläge bearbeiten
--   Mitglied freigegebene Pläne lesen, Vorschläge einreichen, eigene sehen
-- Jede Zeile gehört über organisation_id (direkt oder über den Plan bzw. Block)
-- zu einer Organisation; RLS vergleicht mit app.dienst_org.
-- Ohne Scope sieht fw_app nichts und darf nichts.

CREATE SCHEMA "dienstplan";
--> statement-breakpoint
CREATE TYPE "dienstplan"."plan_status" AS ENUM('entwurf', 'freigegeben');--> statement-breakpoint
CREATE TYPE "dienstplan"."regel_typ" AS ENUM('wochen_zyklus', 'monats_wochentag');--> statement-breakpoint
CREATE TYPE "dienstplan"."termin_quelle" AS ENUM('rhythmus', 'manuell');--> statement-breakpoint
CREATE TYPE "dienstplan"."vorschlag_status" AS ENUM('offen', 'uebernommen', 'verworfen');--> statement-breakpoint
CREATE TABLE "dienstplan"."ausgleich_personen" (
	"organisation_id" integer NOT NULL,
	"kamerad_id" integer NOT NULL,
	CONSTRAINT "ausgleich_personen_org_kamerad" UNIQUE("organisation_id","kamerad_id")
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."bereiche" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"name" text NOT NULL,
	"sortierung" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "bereiche_org_name" UNIQUE("organisation_id","name")
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."erinnerungs_einstellungen" (
	"organisation_id" integer PRIMARY KEY NOT NULL,
	"aktiv" boolean DEFAULT false NOT NULL,
	"tage_vorher" smallint[] DEFAULT '{14,3}' NOT NULL,
	"kanaele" text[] DEFAULT '{email}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."erinnerungs_versand" (
	"id" serial PRIMARY KEY NOT NULL,
	"termin_verantwortlicher_id" integer NOT NULL,
	"tage_vorher" smallint NOT NULL,
	"kanal" text NOT NULL,
	"gesendet_am" timestamp with time zone,
	"fehler" text,
	CONSTRAINT "erinnerungs_versand_eindeutig" UNIQUE("termin_verantwortlicher_id","tage_vorher","kanal")
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."export_laeufe" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"profil_id" integer NOT NULL,
	"modus" text NOT NULL,
	"stand" jsonb NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"erstellt_von" integer NOT NULL,
	CONSTRAINT "export_laeufe_modus" CHECK ("dienstplan"."export_laeufe"."modus" IN ('komplett', 'aenderungen'))
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."export_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"name" text NOT NULL,
	"trennzeichen" text DEFAULT ';' NOT NULL,
	"kodierung" text DEFAULT 'utf-8-bom' NOT NULL,
	"kopfzeile" boolean DEFAULT true NOT NULL,
	"spalten" jsonb NOT NULL,
	"nur_freigegeben" boolean DEFAULT true NOT NULL,
	"kategorien" text[],
	CONSTRAINT "export_profile_kodierung" CHECK ("dienstplan"."export_profile"."kodierung" IN ('utf-8', 'utf-8-bom', 'windows-1252'))
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."externe_personen" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"name" text,
	"organisation" text,
	"funktion" text,
	"email" text,
	"aktiv" boolean DEFAULT true NOT NULL,
	CONSTRAINT "name_oder_organisation" CHECK (num_nonnulls("dienstplan"."externe_personen"."name", "dienstplan"."externe_personen"."organisation") >= 1)
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."kategorien" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"kuerzel" text NOT NULL,
	"name" text NOT NULL,
	"farbe" text NOT NULL,
	"standard_uhrzeit" time,
	"standard_dauer_minuten" smallint DEFAULT 120 NOT NULL,
	"sortierung" smallint DEFAULT 0 NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	CONSTRAINT "kategorien_org_kuerzel" UNIQUE("organisation_id","kuerzel"),
	CONSTRAINT "kategorien_farbe" CHECK ("dienstplan"."kategorien"."farbe" IN ('blue','teal','orange','indigo','pink','purple','red','yellow','green','gray')),
	CONSTRAINT "kategorien_dauer" CHECK ("dienstplan"."kategorien"."standard_dauer_minuten" > 0)
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."organisationen" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."plaene" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"jahr" integer NOT NULL,
	"status" "dienstplan"."plan_status" DEFAULT 'entwurf' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"freigegeben_am" timestamp with time zone,
	"freigegeben_von" integer,
	CONSTRAINT "plaene_org_jahr" UNIQUE("organisation_id","jahr"),
	CONSTRAINT "plaene_jahr" CHECK ("dienstplan"."plaene"."jahr" BETWEEN 2000 AND 2100)
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."plan_versionen" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"nummer" integer NOT NULL,
	"anlass" text NOT NULL,
	"bezeichnung" text,
	"inhalt" jsonb NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"erstellt_von" integer NOT NULL,
	CONSTRAINT "plan_versionen_plan_nummer" UNIQUE("plan_id","nummer"),
	CONSTRAINT "plan_versionen_anlass" CHECK ("dienstplan"."plan_versionen"."anlass" IN ('freigabe', 'manuell'))
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."rhythmus_regeln" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"name" text NOT NULL,
	"typ" "dienstplan"."regel_typ" NOT NULL,
	"wochentag" smallint NOT NULL,
	"uhrzeit" time NOT NULL,
	"anker_datum" date,
	"muster" text[],
	"nter_wochentag" smallint,
	"monate" smallint[],
	"kategorie_kuerzel" text,
	"gueltig_ab" date NOT NULL,
	"gueltig_bis" date,
	"aktiv" boolean DEFAULT true NOT NULL,
	CONSTRAINT "regeln_wochentag" CHECK ("dienstplan"."rhythmus_regeln"."wochentag" BETWEEN 1 AND 7),
	CONSTRAINT "regeln_gueltig" CHECK ("dienstplan"."rhythmus_regeln"."gueltig_bis" IS NULL OR "dienstplan"."rhythmus_regeln"."gueltig_bis" >= "dienstplan"."rhythmus_regeln"."gueltig_ab"),
	CONSTRAINT "regeln_wochen_zyklus" CHECK ("dienstplan"."rhythmus_regeln"."typ" <> 'wochen_zyklus' OR ("dienstplan"."rhythmus_regeln"."anker_datum" IS NOT NULL AND cardinality("dienstplan"."rhythmus_regeln"."muster") >= 1)),
	CONSTRAINT "regeln_monats_wochentag" CHECK ("dienstplan"."rhythmus_regeln"."typ" <> 'monats_wochentag' OR ("dienstplan"."rhythmus_regeln"."nter_wochentag" IN (1,2,3,4,5,-1) AND cardinality("dienstplan"."rhythmus_regeln"."monate") >= 1 AND "dienstplan"."rhythmus_regeln"."kategorie_kuerzel" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."termin_themen" (
	"id" serial PRIMARY KEY NOT NULL,
	"termin_id" integer NOT NULL,
	"thema_id" integer,
	"titel_freitext" text,
	"position" smallint NOT NULL,
	"aus_block_id" integer,
	CONSTRAINT "thema_oder_freitext" CHECK (("dienstplan"."termin_themen"."thema_id" IS NOT NULL) <> ("dienstplan"."termin_themen"."titel_freitext" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."termin_verantwortliche" (
	"id" serial PRIMARY KEY NOT NULL,
	"termin_thema_id" integer NOT NULL,
	"kamerad_id" integer,
	"externe_person_id" integer,
	"platzhalter" text,
	"position" smallint NOT NULL,
	CONSTRAINT "genau_ein_bezug" CHECK (num_nonnulls("dienstplan"."termin_verantwortliche"."kamerad_id", "dienstplan"."termin_verantwortliche"."externe_person_id", "dienstplan"."termin_verantwortliche"."platzhalter") = 1),
	CONSTRAINT "platzhalter_werte" CHECK ("dienstplan"."termin_verantwortliche"."platzhalter" IS NULL OR "dienstplan"."termin_verantwortliche"."platzhalter" IN ('alle_gf', 'offen'))
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."termine" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"datum" date NOT NULL,
	"uhrzeit" time,
	"dauer_minuten" smallint,
	"kategorie_id" integer NOT NULL,
	"quelle" "dienstplan"."termin_quelle" DEFAULT 'manuell' NOT NULL,
	"regel_id" integer,
	"rhythmus_datum" date,
	"ausgefallen" boolean DEFAULT false NOT NULL,
	"ort" text,
	"bemerkung" text,
	"notizen" text,
	"aktualisiert_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "termine_rhythmus" CHECK ("dienstplan"."termine"."quelle" <> 'rhythmus' OR ("dienstplan"."termine"."regel_id" IS NOT NULL AND "dienstplan"."termine"."rhythmus_datum" IS NOT NULL)),
	CONSTRAINT "termine_dauer" CHECK ("dienstplan"."termine"."dauer_minuten" IS NULL OR "dienstplan"."termine"."dauer_minuten" > 0)
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."themen" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"titel" text NOT NULL,
	"kurztitel" text,
	"bereich_id" integer,
	"notizen" text,
	"pflicht_jaehrlich" boolean DEFAULT false NOT NULL,
	"zielgruppe" text,
	"aktiv" boolean DEFAULT true NOT NULL,
	CONSTRAINT "themen_org_titel" UNIQUE("organisation_id","titel")
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."themenblock_positionen" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_id" integer NOT NULL,
	"thema_id" integer NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."themenbloecke" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"name" text NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dienstplan"."themenvorschlaege" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"titel" text NOT NULL,
	"beschreibung" text,
	"vorgeschlagen_von" integer NOT NULL,
	"vorgeschlagen_am" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "dienstplan"."vorschlag_status" DEFAULT 'offen' NOT NULL,
	"thema_id" integer
);
--> statement-breakpoint
ALTER TABLE "dienstplan"."ausgleich_personen" ADD CONSTRAINT "ausgleich_personen_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."ausgleich_personen" ADD CONSTRAINT "ausgleich_personen_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."bereiche" ADD CONSTRAINT "bereiche_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."erinnerungs_einstellungen" ADD CONSTRAINT "erinnerungs_einstellungen_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."erinnerungs_versand" ADD CONSTRAINT "erinnerungs_versand_termin_verantwortlicher_id_termin_verantwortliche_id_fk" FOREIGN KEY ("termin_verantwortlicher_id") REFERENCES "dienstplan"."termin_verantwortliche"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."export_laeufe" ADD CONSTRAINT "export_laeufe_plan_id_plaene_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dienstplan"."plaene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."export_laeufe" ADD CONSTRAINT "export_laeufe_profil_id_export_profile_id_fk" FOREIGN KEY ("profil_id") REFERENCES "dienstplan"."export_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."export_laeufe" ADD CONSTRAINT "export_laeufe_erstellt_von_kameraden_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."export_profile" ADD CONSTRAINT "export_profile_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."externe_personen" ADD CONSTRAINT "externe_personen_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."kategorien" ADD CONSTRAINT "kategorien_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."plaene" ADD CONSTRAINT "plaene_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."plaene" ADD CONSTRAINT "plaene_freigegeben_von_kameraden_id_fk" FOREIGN KEY ("freigegeben_von") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."plan_versionen" ADD CONSTRAINT "plan_versionen_plan_id_plaene_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dienstplan"."plaene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."plan_versionen" ADD CONSTRAINT "plan_versionen_erstellt_von_kameraden_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."rhythmus_regeln" ADD CONSTRAINT "rhythmus_regeln_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termin_themen" ADD CONSTRAINT "termin_themen_termin_id_termine_id_fk" FOREIGN KEY ("termin_id") REFERENCES "dienstplan"."termine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termin_themen" ADD CONSTRAINT "termin_themen_thema_id_themen_id_fk" FOREIGN KEY ("thema_id") REFERENCES "dienstplan"."themen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termin_themen" ADD CONSTRAINT "termin_themen_aus_block_id_themenbloecke_id_fk" FOREIGN KEY ("aus_block_id") REFERENCES "dienstplan"."themenbloecke"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termin_verantwortliche" ADD CONSTRAINT "termin_verantwortliche_termin_thema_id_termin_themen_id_fk" FOREIGN KEY ("termin_thema_id") REFERENCES "dienstplan"."termin_themen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termin_verantwortliche" ADD CONSTRAINT "termin_verantwortliche_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termin_verantwortliche" ADD CONSTRAINT "termin_verantwortliche_externe_person_id_externe_personen_id_fk" FOREIGN KEY ("externe_person_id") REFERENCES "dienstplan"."externe_personen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termine" ADD CONSTRAINT "termine_plan_id_plaene_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dienstplan"."plaene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termine" ADD CONSTRAINT "termine_kategorie_id_kategorien_id_fk" FOREIGN KEY ("kategorie_id") REFERENCES "dienstplan"."kategorien"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."termine" ADD CONSTRAINT "termine_regel_id_rhythmus_regeln_id_fk" FOREIGN KEY ("regel_id") REFERENCES "dienstplan"."rhythmus_regeln"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themen" ADD CONSTRAINT "themen_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themen" ADD CONSTRAINT "themen_bereich_id_bereiche_id_fk" FOREIGN KEY ("bereich_id") REFERENCES "dienstplan"."bereiche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themenblock_positionen" ADD CONSTRAINT "themenblock_positionen_block_id_themenbloecke_id_fk" FOREIGN KEY ("block_id") REFERENCES "dienstplan"."themenbloecke"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themenblock_positionen" ADD CONSTRAINT "themenblock_positionen_thema_id_themen_id_fk" FOREIGN KEY ("thema_id") REFERENCES "dienstplan"."themen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themenbloecke" ADD CONSTRAINT "themenbloecke_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themenvorschlaege" ADD CONSTRAINT "themenvorschlaege_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themenvorschlaege" ADD CONSTRAINT "themenvorschlaege_vorgeschlagen_von_kameraden_id_fk" FOREIGN KEY ("vorgeschlagen_von") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."themenvorschlaege" ADD CONSTRAINT "themenvorschlaege_thema_id_themen_id_fk" FOREIGN KEY ("thema_id") REFERENCES "dienstplan"."themen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_termin_themen_termin" ON "dienstplan"."termin_themen" USING btree ("termin_id","position");--> statement-breakpoint
CREATE INDEX "idx_termin_verantwortliche_thema" ON "dienstplan"."termin_verantwortliche" USING btree ("termin_thema_id","position");--> statement-breakpoint
CREATE INDEX "idx_termine_plan_datum" ON "dienstplan"."termine" USING btree ("plan_id","datum");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_termine_regel_rhythmus" ON "dienstplan"."termine" USING btree ("plan_id","regel_id","rhythmus_datum") WHERE "dienstplan"."termine"."regel_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_themenblock_positionen_block" ON "dienstplan"."themenblock_positionen" USING btree ("block_id","position");--> statement-breakpoint
-- ════════════════════════════════════════════════════════════════════════════
-- Handteil
-- ════════════════════════════════════════════════════════════════════════════

-- ── Seeds (vor RLS, damit sie auch mit einem Owner ohne BYPASSRLS laufen) ────
-- Kategorien laut Blatt "Diensttypen" und Spec 7.1; F (frei) ist keine
-- Kategorie, sondern termine.ausgefallen. Uhrzeiten aus den Plänen 2023–2026
-- (19:30), Dauern laut Annahme der Spec (Dienst und Gremien 2 h,
-- Kameradschaft 4 h; Brandschutz/Osterfeuer 4 h).
INSERT INTO dienstplan.organisationen (id, name)
VALUES (1, 'Ortsfeuerwehr Wietmarschen')
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

INSERT INTO dienstplan.kategorien
  (organisation_id, kuerzel, name, farbe, standard_uhrzeit, standard_dauer_minuten, sortierung)
VALUES
  (1, 'D', 'Dienstabend',             'blue',   '19:30', 120, 1),
  (1, 'Z', 'Zwischendienst',          'teal',   '19:30', 120, 2),
  (1, 'G', 'Gruppenführerrunde',      'orange', '19:30', 120, 3),
  (1, 'O', 'Ortskommando',            'indigo', '19:30', 120, 4),
  (1, 'J', 'Jahreshauptversammlung',  'purple', '19:30', 120, 5),
  (1, 'K', 'Kameradschaft',           'pink',   NULL,    240, 6),
  (1, 'B', 'Brandschutz etc.',        'red',    NULL,    240, 7)
ON CONFLICT ON CONSTRAINT kategorien_org_kuerzel DO NOTHING;--> statement-breakpoint

-- Rhythmusregeln (Spec 5.1, 5.2; festgelegt 11.11.2026). Gültig ab 2026: Der
-- Zwischendienst liegt seit 2026 eine Woche vor dem Dienstabend (5.2a).
INSERT INTO dienstplan.rhythmus_regeln
  (organisation_id, name, typ, wochentag, uhrzeit, anker_datum, muster, gueltig_ab)
SELECT 1, 'Dienstabende', 'wochen_zyklus', 2, '19:30', DATE '2026-04-28', ARRAY['D', '', 'D', 'Z'], DATE '2026-01-01'
WHERE NOT EXISTS (SELECT 1 FROM dienstplan.rhythmus_regeln WHERE organisation_id = 1 AND name = 'Dienstabende');--> statement-breakpoint
INSERT INTO dienstplan.rhythmus_regeln
  (organisation_id, name, typ, wochentag, uhrzeit, nter_wochentag, monate, kategorie_kuerzel, gueltig_ab)
SELECT 1, 'Gruppenführerrunde', 'monats_wochentag', 4, '19:30', 3, ARRAY[2, 5, 8, 11]::smallint[], 'G', DATE '2026-01-01'
WHERE NOT EXISTS (SELECT 1 FROM dienstplan.rhythmus_regeln WHERE organisation_id = 1 AND name = 'Gruppenführerrunde');--> statement-breakpoint
INSERT INTO dienstplan.rhythmus_regeln
  (organisation_id, name, typ, wochentag, uhrzeit, nter_wochentag, monate, kategorie_kuerzel, gueltig_ab)
SELECT 1, 'Ortskommando', 'monats_wochentag', 4, '19:30', 3, ARRAY[1, 4, 7, 10]::smallint[], 'O', DATE '2026-01-01'
WHERE NOT EXISTS (SELECT 1 FROM dienstplan.rhythmus_regeln WHERE organisation_id = 1 AND name = 'Ortskommando');--> statement-breakpoint

INSERT INTO dienstplan.erinnerungs_einstellungen (organisation_id)
VALUES (1)
ON CONFLICT (organisation_id) DO NOTHING;--> statement-breakpoint

-- ── Rechte fw_app ────────────────────────────────────────────────────────────
-- Für dienstplan gibt es keine ALTER DEFAULT PRIVILEGES (nur core, psa,
-- fw_funk). Rechte deshalb hier; spätere Migrationen vergeben sie für neue
-- Tabellen selbst. create-fw-app-role.sql fasst dienstplan nicht an.
GRANT USAGE ON SCHEMA dienstplan TO fw_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dienstplan TO fw_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dienstplan TO fw_app;--> statement-breakpoint
-- Organisation nur als Seed; Versionen und Exportprotokoll sind unveränderlich;
-- den Versand schreibt später der Erinnerungsjob (Release 2) mit eigenem Weg.
REVOKE INSERT, UPDATE, DELETE ON dienstplan.organisationen FROM fw_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON dienstplan.plan_versionen FROM fw_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON dienstplan.export_laeufe FROM fw_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON dienstplan.erinnerungs_versand FROM fw_app;--> statement-breakpoint

-- ── Hilfsfunktionen für die Policies (SECURITY INVOKER) ──────────────────────
CREATE OR REPLACE FUNCTION dienstplan.akt_org() RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT NULLIF(current_setting('app.dienst_org', true), '')::integer $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION dienstplan.akt_kamerad() RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT NULLIF(current_setting('app.kamerad_id', true), '')::integer $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION dienstplan.ist_admin() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT COALESCE(current_setting('app.dienst_rolle', true), '') = 'Admin' $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION dienstplan.ist_planer() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT COALESCE(current_setting('app.dienst_rolle', true), '') IN ('Admin', 'Planer') $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION dienstplan.ist_mitglied() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT COALESCE(current_setting('app.dienst_rolle', true), '') IN ('Admin', 'Planer', 'Mitglied') $$;--> statement-breakpoint

-- ── RLS einschalten (alle Tabellen, auch für den Eigentümer) ─────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'dienstplan' LOOP
    EXECUTE format('ALTER TABLE dienstplan.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE dienstplan.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;--> statement-breakpoint

-- ── Policies ─────────────────────────────────────────────────────────────────
-- Muster: <t>_lesen (SELECT) und <t>_schreiben (FOR ALL) bzw. einzelne
-- Befehle, wo die Regeln sich unterscheiden. Untergeordnete Tabellen prüfen
-- die Sichtbarkeit über den Elternsatz (die Unterabfrage läuft selbst unter RLS).

-- organisationen: nur lesen, nur die eigene
CREATE POLICY organisationen_lesen ON dienstplan.organisationen FOR SELECT
  USING (dienstplan.ist_mitglied() AND id = dienstplan.akt_org());--> statement-breakpoint

-- kategorien: alle lesen, Admin schreibt
CREATE POLICY kategorien_lesen ON dienstplan.kategorien FOR SELECT
  USING (dienstplan.ist_mitglied() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY kategorien_schreiben ON dienstplan.kategorien FOR ALL
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint

-- rhythmus_regeln: Planer lesen (Vorschau), Admin schreibt
CREATE POLICY rhythmus_regeln_lesen ON dienstplan.rhythmus_regeln FOR SELECT
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY rhythmus_regeln_schreiben ON dienstplan.rhythmus_regeln FOR ALL
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint

-- plaene: Planer sehen alle, Mitglieder nur freigegebene. Anlegen und Löschen
-- nur Admin. Ändern dürfen Planer (Version); Status und Freigabe-Felder schützt
-- der Trigger plaene_schutz (nur Admin).
CREATE POLICY plaene_lesen ON dienstplan.plaene FOR SELECT
  USING (organisation_id = dienstplan.akt_org()
         AND (dienstplan.ist_planer() OR (dienstplan.ist_mitglied() AND status = 'freigegeben')));--> statement-breakpoint
CREATE POLICY plaene_anlegen ON dienstplan.plaene FOR INSERT
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY plaene_aendern ON dienstplan.plaene FOR UPDATE
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY plaene_loeschen ON dienstplan.plaene FOR DELETE
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint

-- termine, termin_themen, termin_verantwortliche: Lesen wie der Plan,
-- Schreiben Planer (auch nach Freigabe, Spec 6 und 8)
CREATE POLICY termine_lesen ON dienstplan.termine FOR SELECT
  USING (EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id));--> statement-breakpoint
CREATE POLICY termine_schreiben ON dienstplan.termine FOR ALL
  USING (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id))
  WITH CHECK (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id));--> statement-breakpoint
CREATE POLICY termin_themen_lesen ON dienstplan.termin_themen FOR SELECT
  USING (EXISTS (SELECT 1 FROM dienstplan.termine t WHERE t.id = termin_id));--> statement-breakpoint
CREATE POLICY termin_themen_schreiben ON dienstplan.termin_themen FOR ALL
  USING (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.termine t WHERE t.id = termin_id))
  WITH CHECK (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.termine t WHERE t.id = termin_id));--> statement-breakpoint
CREATE POLICY termin_verantwortliche_lesen ON dienstplan.termin_verantwortliche FOR SELECT
  USING (EXISTS (SELECT 1 FROM dienstplan.termin_themen tt WHERE tt.id = termin_thema_id));--> statement-breakpoint
CREATE POLICY termin_verantwortliche_schreiben ON dienstplan.termin_verantwortliche FOR ALL
  USING (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.termin_themen tt WHERE tt.id = termin_thema_id))
  WITH CHECK (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.termin_themen tt WHERE tt.id = termin_thema_id));--> statement-breakpoint

-- plan_versionen: Planer lesen und legen an (manuell, Freigabe); unveränderlich
CREATE POLICY plan_versionen_lesen ON dienstplan.plan_versionen FOR SELECT
  USING (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id));--> statement-breakpoint
CREATE POLICY plan_versionen_anlegen ON dienstplan.plan_versionen FOR INSERT
  WITH CHECK (dienstplan.ist_planer() AND erstellt_von = dienstplan.akt_kamerad()
              AND EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id));--> statement-breakpoint

-- Kataloge: alle lesen (Anzeige im Plan), Planer pflegen
CREATE POLICY bereiche_lesen ON dienstplan.bereiche FOR SELECT
  USING (dienstplan.ist_mitglied() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY bereiche_schreiben ON dienstplan.bereiche FOR ALL
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY themen_lesen ON dienstplan.themen FOR SELECT
  USING (dienstplan.ist_mitglied() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY themen_schreiben ON dienstplan.themen FOR ALL
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY themenbloecke_lesen ON dienstplan.themenbloecke FOR SELECT
  USING (dienstplan.ist_mitglied() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY themenbloecke_schreiben ON dienstplan.themenbloecke FOR ALL
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY themenblock_positionen_lesen ON dienstplan.themenblock_positionen FOR SELECT
  USING (EXISTS (SELECT 1 FROM dienstplan.themenbloecke b WHERE b.id = block_id));--> statement-breakpoint
CREATE POLICY themenblock_positionen_schreiben ON dienstplan.themenblock_positionen FOR ALL
  USING (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.themenbloecke b WHERE b.id = block_id))
  WITH CHECK (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.themenbloecke b WHERE b.id = block_id));--> statement-breakpoint

-- themenvorschlaege: alle reichen ein (nur für sich, Status offen), sehen die
-- eigenen; Planer sehen alle und übernehmen/verwerfen
CREATE POLICY themenvorschlaege_lesen ON dienstplan.themenvorschlaege FOR SELECT
  USING (organisation_id = dienstplan.akt_org()
         AND (dienstplan.ist_planer()
              OR (dienstplan.ist_mitglied() AND vorgeschlagen_von = dienstplan.akt_kamerad())));--> statement-breakpoint
CREATE POLICY themenvorschlaege_einreichen ON dienstplan.themenvorschlaege FOR INSERT
  WITH CHECK (dienstplan.ist_mitglied() AND organisation_id = dienstplan.akt_org()
              AND vorgeschlagen_von = dienstplan.akt_kamerad()
              AND status = 'offen' AND thema_id IS NULL);--> statement-breakpoint
CREATE POLICY themenvorschlaege_bearbeiten ON dienstplan.themenvorschlaege FOR UPDATE
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY themenvorschlaege_loeschen ON dienstplan.themenvorschlaege FOR DELETE
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint

-- externe_personen: alle lesen (Namen im Plan; E-Mail gibt nur die App-
-- Projektion für Planer aus), Planer pflegen
CREATE POLICY externe_personen_lesen ON dienstplan.externe_personen FOR SELECT
  USING (dienstplan.ist_mitglied() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY externe_personen_schreiben ON dienstplan.externe_personen FOR ALL
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint

-- ausgleich_personen: Planer lesen, Admin pflegt
CREATE POLICY ausgleich_personen_lesen ON dienstplan.ausgleich_personen FOR SELECT
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY ausgleich_personen_schreiben ON dienstplan.ausgleich_personen FOR ALL
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint

-- export_profile: Planer lesen (Export), Admin pflegt
CREATE POLICY export_profile_lesen ON dienstplan.export_profile FOR SELECT
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY export_profile_schreiben ON dienstplan.export_profile FOR ALL
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint

-- export_laeufe: Planer lesen und protokollieren; unveränderlich
CREATE POLICY export_laeufe_lesen ON dienstplan.export_laeufe FOR SELECT
  USING (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id));--> statement-breakpoint
CREATE POLICY export_laeufe_anlegen ON dienstplan.export_laeufe FOR INSERT
  WITH CHECK (dienstplan.ist_planer() AND erstellt_von = dienstplan.akt_kamerad()
              AND EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id));--> statement-breakpoint

-- Erinnerungen (Release 2): nur Admin
CREATE POLICY erinnerungs_einstellungen_admin ON dienstplan.erinnerungs_einstellungen FOR ALL
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY erinnerungs_versand_lesen ON dienstplan.erinnerungs_versand FOR SELECT
  USING (dienstplan.ist_admin()
         AND EXISTS (SELECT 1 FROM dienstplan.termin_verantwortliche v WHERE v.id = termin_verantwortlicher_id));--> statement-breakpoint

-- ── Trigger ──────────────────────────────────────────────────────────────────
-- plaene_schutz: Status, Freigabe-Felder, Jahr und Organisation ändert nur der
-- Admin. Planer dürfen den Plan sonst nur über die Versionszählung berühren.
CREATE OR REPLACE FUNCTION dienstplan.plaene_schutz() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF (NEW.status, NEW.freigegeben_am, NEW.freigegeben_von, NEW.jahr, NEW.organisation_id)
     IS DISTINCT FROM (OLD.status, OLD.freigegeben_am, OLD.freigegeben_von, OLD.jahr, OLD.organisation_id)
     AND NOT dienstplan.ist_admin() THEN
    RAISE EXCEPTION 'Status und Freigabe eines Plans ändert nur der Dienstplan-Admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER plaene_schutz BEFORE UPDATE ON dienstplan.plaene
  FOR EACH ROW EXECUTE FUNCTION dienstplan.plaene_schutz();--> statement-breakpoint

-- Versionszählung (Live-Ansicht, Spec 7.3): Jede Änderung an einem Termin
-- setzt termine.aktualisiert_am und erhöht plaene.version. Änderungen an
-- Themen und Verantwortlichen berühren ihren Termin und laufen so durch
-- dieselbe Kette. SECURITY INVOKER: Es gelten die Rechte des Planers.
CREATE OR REPLACE FUNCTION dienstplan.termine_zeitstempel() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.aktualisiert_am := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER termine_zeitstempel BEFORE UPDATE ON dienstplan.termine
  FOR EACH ROW EXECUTE FUNCTION dienstplan.termine_zeitstempel();--> statement-breakpoint

CREATE OR REPLACE FUNCTION dienstplan.termine_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE dienstplan.plaene SET version = version + 1 WHERE id = OLD.plan_id;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN
    UPDATE dienstplan.plaene SET version = version + 1 WHERE id = NEW.plan_id;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER termine_version AFTER INSERT OR UPDATE OR DELETE ON dienstplan.termine
  FOR EACH ROW EXECUTE FUNCTION dienstplan.termine_version();--> statement-breakpoint

CREATE OR REPLACE FUNCTION dienstplan.termin_themen_beruehren() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE dienstplan.termine SET aktualisiert_am = now() WHERE id = OLD.termin_id;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.termin_id IS DISTINCT FROM OLD.termin_id) THEN
    UPDATE dienstplan.termine SET aktualisiert_am = now() WHERE id = NEW.termin_id;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER termin_themen_beruehren AFTER INSERT OR UPDATE OR DELETE ON dienstplan.termin_themen
  FOR EACH ROW EXECUTE FUNCTION dienstplan.termin_themen_beruehren();--> statement-breakpoint

CREATE OR REPLACE FUNCTION dienstplan.termin_verantwortliche_beruehren() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE dienstplan.termin_themen SET position = position WHERE id = OLD.termin_thema_id;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.termin_thema_id IS DISTINCT FROM OLD.termin_thema_id) THEN
    UPDATE dienstplan.termin_themen SET position = position WHERE id = NEW.termin_thema_id;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER termin_verantwortliche_beruehren AFTER INSERT OR UPDATE OR DELETE ON dienstplan.termin_verantwortliche
  FOR EACH ROW EXECUTE FUNCTION dienstplan.termin_verantwortliche_beruehren();--> statement-breakpoint

-- ── Namen der Kameraden für das Modul ────────────────────────────────────────
-- Das Modul braucht Namen aller Kameraden (Anzeigename, Spec 4.2), darf
-- core.kameraden aber nicht lesen (E-Mail, Karten-ID, Personalnummer). Die
-- Funktion gibt nur die Namensfelder und aktiv zurück, für jede Dienstplan-
-- Rolle. Muster wie set_karten_id: app.app_rolle='Admin' nur im Rumpf, damit
-- kameraden_lesen auch für einen Eigentümer ohne RLS-Bypass greift.
CREATE OR REPLACE FUNCTION dienstplan.kameraden_namen()
RETURNS TABLE (id integer, vorname text, name text, spitzname text, spitzname_anzeigen boolean, aktiv boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_alt_rolle text := current_setting('app.app_rolle', true);
BEGIN
  IF COALESCE(current_setting('app.dienst_rolle', true), '') NOT IN ('Admin', 'Planer', 'Mitglied') THEN
    RAISE EXCEPTION 'kameraden_namen: nur im Dienstplan-Scope'
      USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.app_rolle', 'Admin', true);
  RETURN QUERY
    SELECT k.id, k.vorname, k.name, k.spitzname, k.spitzname_anzeigen, k.aktiv
      FROM core.kameraden k
     ORDER BY k.name, k.vorname, k.id;
  PERFORM set_config('app.app_rolle', COALESCE(v_alt_rolle, ''), true);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION dienstplan.kameraden_namen() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION dienstplan.kameraden_namen() TO fw_app;
