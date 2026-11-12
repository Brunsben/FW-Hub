-- Dienstplan Phase 10: Exporte (Spec 9.4, 9.5).
-- ADDITIV (neue Tabelle, neue Spalte, NOT NULL gelockert, neue Funktion, Seed).
--
-- 1. export_laeufe: Spalte format ('csv' | 'ics'), profil_id nur bei csv
--    (iCal-Änderungsexport hat kein Profil). Bestehende Zeilen sind csv.
-- 2. ical_abos: geheime Abo-URL (nur SHA-256-Hash gespeichert), je Organisation
--    höchstens eine aktive. Admin legt an und widerruft. abrufe und
--    zuletzt_abgerufen_am zeigen, ob Google bzw. DIVERA den Link abrufen.
-- 3. dienstplan.abo_scope(hash): SECURITY DEFINER. Prüft das Token in der
--    Datenbank, zählt den Abruf und setzt für den Rest der Transaktion den
--    Lesescope Mitglied der Organisation des Tokens (app.kamerad_id = 0).
--    Damit gelten für das Abo genau die Mitglieder-Policies (nur freigegebene
--    Pläne), es braucht keine neuen Policies auf den Plantabellen. Nur ohne
--    bestehenden Scope aufrufbar. Einziger Aufrufer: withDienstplanAboScope
--    (lib/db/scoped.ts) in GET /api/dienstplan/abo/[token].
--    Die Funktion setzt für ihre eigene Abfrage app.dienst_rolle='AboPruefung'
--    und app.dienst_abo (Policy ical_abos_pruefen), damit sie auch mit einem
--    Eigentümer ohne RLS-Bypass funktioniert.
-- 4. Seed: Exportprofile „DIVERA 24/7“ (Datum/Von/Bis) und
--    „DIVERA 24/7 (Beginn/Ende)“ für Termine über Mitternacht.
-- Policies in dienstplan: 45 → 50.
--
-- Rücknahme (als Owner):
--   DROP FUNCTION dienstplan.abo_scope(text);
--   DROP TABLE dienstplan.ical_abos;
--   DELETE FROM dienstplan.export_laeufe WHERE format = 'ics';
--   ALTER TABLE dienstplan.export_laeufe DROP CONSTRAINT export_laeufe_format;
--   DROP INDEX dienstplan.idx_export_laeufe_plan;
--   ALTER TABLE dienstplan.export_laeufe DROP COLUMN format;
--   ALTER TABLE dienstplan.export_laeufe ALTER COLUMN profil_id SET NOT NULL;
--   (Seed-Profile dürfen bleiben.)

CREATE TABLE "dienstplan"."ical_abos" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"erstellt_von" integer NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"widerrufen_am" timestamp with time zone,
	"zuletzt_abgerufen_am" timestamp with time zone,
	"abrufe" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ical_abos_hash_format" CHECK ("dienstplan"."ical_abos"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "dienstplan"."export_laeufe" ALTER COLUMN "profil_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dienstplan"."export_laeufe" ADD COLUMN "format" text DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE "dienstplan"."ical_abos" ADD CONSTRAINT "ical_abos_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."ical_abos" ADD CONSTRAINT "ical_abos_erstellt_von_kameraden_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ical_abos_hash" ON "dienstplan"."ical_abos" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "ical_abos_ein_aktives" ON "dienstplan"."ical_abos" USING btree ("organisation_id") WHERE "dienstplan"."ical_abos"."widerrufen_am" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_export_laeufe_plan" ON "dienstplan"."export_laeufe" USING btree ("plan_id","format","profil_id");--> statement-breakpoint
ALTER TABLE "dienstplan"."export_laeufe" ADD CONSTRAINT "export_laeufe_format" CHECK (("dienstplan"."export_laeufe"."format" = 'csv' AND "dienstplan"."export_laeufe"."profil_id" IS NOT NULL) OR ("dienstplan"."export_laeufe"."format" = 'ics' AND "dienstplan"."export_laeufe"."profil_id" IS NULL));
--> statement-breakpoint

-- ── Handteil ─────────────────────────────────────────────────────────────────
-- Schema dienstplan hat keine Default Privileges: Rechte selbst vergeben.
GRANT SELECT, INSERT ON dienstplan.ical_abos TO fw_app;--> statement-breakpoint
GRANT UPDATE (widerrufen_am) ON dienstplan.ical_abos TO fw_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE dienstplan.ical_abos_id_seq TO fw_app;--> statement-breakpoint
ALTER TABLE dienstplan.ical_abos ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE dienstplan.ical_abos FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ical_abos: nur der Dienstplan-Admin der eigenen Organisation
CREATE POLICY ical_abos_lesen ON dienstplan.ical_abos FOR SELECT
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
CREATE POLICY ical_abos_anlegen ON dienstplan.ical_abos FOR INSERT
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org()
              AND erstellt_von = dienstplan.akt_kamerad() AND widerrufen_am IS NULL);--> statement-breakpoint
CREATE POLICY ical_abos_widerrufen ON dienstplan.ical_abos FOR UPDATE
  USING (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_admin() AND organisation_id = dienstplan.akt_org());--> statement-breakpoint
-- Nur für abo_scope(): die eine aktive Zeile zum Hash lesen und den Abruf zählen
CREATE POLICY ical_abos_pruefen_lesen ON dienstplan.ical_abos FOR SELECT
  USING (COALESCE(current_setting('app.dienst_rolle', true), '') = 'AboPruefung'
         AND token_hash = current_setting('app.dienst_abo', true) AND widerrufen_am IS NULL);--> statement-breakpoint
CREATE POLICY ical_abos_pruefen ON dienstplan.ical_abos FOR UPDATE
  USING (COALESCE(current_setting('app.dienst_rolle', true), '') = 'AboPruefung'
         AND token_hash = current_setting('app.dienst_abo', true) AND widerrufen_am IS NULL)
  WITH CHECK (COALESCE(current_setting('app.dienst_rolle', true), '') = 'AboPruefung'
              AND token_hash = current_setting('app.dienst_abo', true) AND widerrufen_am IS NULL);--> statement-breakpoint

CREATE OR REPLACE FUNCTION dienstplan.abo_scope(p_token_hash text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org integer;
BEGIN
  IF COALESCE(current_setting('app.dienst_rolle', true), '') <> ''
     OR COALESCE(current_setting('app.kamerad_id', true), '') <> '' THEN
    RAISE EXCEPTION 'abo_scope: nur ohne bestehenden Scope' USING ERRCODE = '42501';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'abo_scope: Token ungültig' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.dienst_rolle', 'AboPruefung', true);
  PERFORM set_config('app.dienst_abo', p_token_hash, true);
  UPDATE dienstplan.ical_abos
     SET zuletzt_abgerufen_am = now(), abrufe = abrufe + 1
   WHERE token_hash = p_token_hash AND widerrufen_am IS NULL
  RETURNING organisation_id INTO v_org;
  PERFORM set_config('app.dienst_abo', '', true);
  IF v_org IS NULL THEN
    PERFORM set_config('app.dienst_rolle', '', true);
    RAISE EXCEPTION 'abo_scope: Token ungültig oder widerrufen' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.dienst_rolle', 'Mitglied', true);
  PERFORM set_config('app.dienst_org', v_org::text, true);
  PERFORM set_config('app.kamerad_id', '0', true);
  RETURN v_org;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION dienstplan.abo_scope(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION dienstplan.abo_scope(text) TO fw_app;--> statement-breakpoint

-- ── Seed: Exportprofile DIVERA (Spec 9.5) ────────────────────────────────────
INSERT INTO dienstplan.export_profile (organisation_id, name, trennzeichen, kodierung, kopfzeile, spalten, nur_freigegeben)
SELECT 1, 'DIVERA 24/7', ';', 'utf-8-bom', true, '[
  {"ueberschrift": "Datum", "feld": "startDatum", "format": "DD.MM.YYYY"},
  {"ueberschrift": "Von", "feld": "startZeit", "format": "HH:mm"},
  {"ueberschrift": "Bis", "feld": "endeZeit", "format": "HH:mm"},
  {"ueberschrift": "Titel", "feld": "titelMitKategorie"},
  {"ueberschrift": "Text", "feld": "beschreibung"},
  {"ueberschrift": "Ort", "feld": "ort"}
]'::jsonb, true
WHERE EXISTS (SELECT 1 FROM dienstplan.organisationen WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM dienstplan.export_profile WHERE organisation_id = 1 AND name = 'DIVERA 24/7');--> statement-breakpoint
INSERT INTO dienstplan.export_profile (organisation_id, name, trennzeichen, kodierung, kopfzeile, spalten, nur_freigegeben)
SELECT 1, 'DIVERA 24/7 (Beginn/Ende)', ';', 'utf-8-bom', true, '[
  {"ueberschrift": "Beginn", "feld": "start", "format": "DD.MM.YYYY HH:mm"},
  {"ueberschrift": "Ende", "feld": "ende", "format": "DD.MM.YYYY HH:mm"},
  {"ueberschrift": "Titel", "feld": "titelMitKategorie"},
  {"ueberschrift": "Text", "feld": "beschreibung"},
  {"ueberschrift": "Ort", "feld": "ort"}
]'::jsonb, true
WHERE EXISTS (SELECT 1 FROM dienstplan.organisationen WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM dienstplan.export_profile WHERE organisation_id = 1 AND name = 'DIVERA 24/7 (Beginn/Ende)');
