-- Dienstplan Phase 6: Anzeige-Token für die Präsentation und Fokus-Termin.
-- ADDITIV (neue Tabelle, neue Spalte, neue Policies; bestehende Rechte bleiben).
--
-- Spec: docs/dienstplan/DIENSTPLAN_SPEC.md, Abschnitte 6 und 7.3.
-- Der erste Teil entspricht dem Drizzle-Schema (Snapshot), der Handteil ab
-- "Handteil" ist von Hand ergänzt.
--
-- Anzeige-Scope (withDienstplanAnzeigeScope, lib/db/scoped.ts):
--   app.dienst_rolle   = 'Anzeige'
--   app.dienst_anzeige = SHA-256-Hash des Tokens (hex)
-- Sichtbar ist dann genau der Plan, zu dem ein gültiges (nicht abgelaufenes)
-- Token mit diesem Hash gehört, mit Terminen, Themen, Verantwortlichen und den
-- nötigen Katalogen. Schreiben darf die Rolle nichts. Die Plan-ID kommt nie aus
-- dem Request, sondern aus der Token-Zeile in der Datenbank.
--
-- Rücknahme (als Owner):
--   DROP POLICY plaene_anzeige ON dienstplan.plaene;
--   DROP POLICY kategorien_anzeige ON dienstplan.kategorien;
--   DROP POLICY themen_anzeige ON dienstplan.themen;
--   DROP POLICY externe_personen_anzeige ON dienstplan.externe_personen;
--   DROP TABLE dienstplan.anzeige_tokens;
--   ALTER TABLE dienstplan.plaene DROP COLUMN fokus_termin_id;
--   DROP FUNCTION dienstplan.ist_anzeige();
--   DROP FUNCTION dienstplan.anzeige_tokens_plan();
--   kameraden_namen() aus 0018 wiederherstellen.

CREATE TABLE "dienstplan"."anzeige_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"gueltig_bis" timestamp with time zone NOT NULL,
	"erstellt_von" integer NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anzeige_tokens_hash_format" CHECK ("dienstplan"."anzeige_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "dienstplan"."plaene" ADD COLUMN "fokus_termin_id" integer;--> statement-breakpoint
ALTER TABLE "dienstplan"."anzeige_tokens" ADD CONSTRAINT "anzeige_tokens_organisation_id_organisationen_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "dienstplan"."organisationen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."anzeige_tokens" ADD CONSTRAINT "anzeige_tokens_plan_id_plaene_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dienstplan"."plaene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienstplan"."anzeige_tokens" ADD CONSTRAINT "anzeige_tokens_erstellt_von_kameraden_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anzeige_tokens_hash" ON "dienstplan"."anzeige_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_anzeige_tokens_plan" ON "dienstplan"."anzeige_tokens" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "dienstplan"."plaene" ADD CONSTRAINT "plaene_fokus_termin_id_termine_id_fk" FOREIGN KEY ("fokus_termin_id") REFERENCES "dienstplan"."termine"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ── Handteil ─────────────────────────────────────────────────────────────────
-- Schema dienstplan hat keine Default Privileges: Rechte selbst vergeben.
GRANT SELECT, INSERT, DELETE ON dienstplan.anzeige_tokens TO fw_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE dienstplan.anzeige_tokens_id_seq TO fw_app;--> statement-breakpoint
ALTER TABLE dienstplan.anzeige_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE dienstplan.anzeige_tokens FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE OR REPLACE FUNCTION dienstplan.ist_anzeige() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT COALESCE(current_setting('app.dienst_rolle', true), '') = 'Anzeige' $$;--> statement-breakpoint

-- anzeige_tokens: Planer legen für Pläne der eigenen Organisation an, sehen und
-- beenden sie. Der Anzeige-Scope sieht nur die eine gültige Zeile zu seinem Hash.
-- Die Zugehörigkeit des Plans prüft der Trigger anzeige_tokens_plan (eine
-- Unterabfrage auf plaene in der Policy wäre zirkulär, weil plaene_anzeige
-- ihrerseits anzeige_tokens liest).
CREATE POLICY anzeige_tokens_planer ON dienstplan.anzeige_tokens FOR ALL
  USING (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org())
  WITH CHECK (dienstplan.ist_planer() AND organisation_id = dienstplan.akt_org()
              AND erstellt_von = dienstplan.akt_kamerad()
              AND gueltig_bis <= now() + interval '24 hours');--> statement-breakpoint
-- SECURITY INVOKER: Die Abfrage läuft unter RLS, ein Plan einer fremden
-- Organisation ist für den Planer unsichtbar und wird abgelehnt.
CREATE OR REPLACE FUNCTION dienstplan.anzeige_tokens_plan() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dienstplan.plaene p
                  WHERE p.id = NEW.plan_id AND p.organisation_id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'Anzeige-Link nur für einen Plan der eigenen Organisation'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER anzeige_tokens_plan BEFORE INSERT OR UPDATE ON dienstplan.anzeige_tokens
  FOR EACH ROW EXECUTE FUNCTION dienstplan.anzeige_tokens_plan();--> statement-breakpoint
CREATE POLICY anzeige_tokens_pruefen ON dienstplan.anzeige_tokens FOR SELECT
  USING (dienstplan.ist_anzeige()
         AND token_hash = current_setting('app.dienst_anzeige', true)
         AND gueltig_bis > now());--> statement-breakpoint

-- Lesen im Anzeige-Scope: der Plan des Tokens (termine, termin_themen und
-- termin_verantwortliche folgen über ihre bestehenden Lese-Policies dem Plan)
-- und die Kataloge seiner Organisation, die die Anzeige braucht.
CREATE POLICY plaene_anzeige ON dienstplan.plaene FOR SELECT
  USING (dienstplan.ist_anzeige()
         AND EXISTS (SELECT 1 FROM dienstplan.anzeige_tokens a WHERE a.plan_id = plaene.id));--> statement-breakpoint
CREATE POLICY kategorien_anzeige ON dienstplan.kategorien FOR SELECT
  USING (dienstplan.ist_anzeige()
         AND organisation_id IN (SELECT a.organisation_id FROM dienstplan.anzeige_tokens a));--> statement-breakpoint
CREATE POLICY themen_anzeige ON dienstplan.themen FOR SELECT
  USING (dienstplan.ist_anzeige()
         AND organisation_id IN (SELECT a.organisation_id FROM dienstplan.anzeige_tokens a));--> statement-breakpoint
CREATE POLICY externe_personen_anzeige ON dienstplan.externe_personen FOR SELECT
  USING (dienstplan.ist_anzeige()
         AND organisation_id IN (SELECT a.organisation_id FROM dienstplan.anzeige_tokens a));--> statement-breakpoint

-- kameraden_namen(): zusätzlich im Anzeige-Scope, aber nur mit gültigem Token.
-- Die Prüfung steht ausdrücklich im Rumpf (nicht nur über RLS), weil die
-- Funktion mit den Rechten des Eigentümers läuft.
CREATE OR REPLACE FUNCTION dienstplan.kameraden_namen()
RETURNS TABLE (id integer, vorname text, name text, spitzname text, spitzname_anzeigen boolean, aktiv boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_alt_rolle text := current_setting('app.app_rolle', true);
  v_rolle text := COALESCE(current_setting('app.dienst_rolle', true), '');
BEGIN
  IF v_rolle = 'Anzeige' THEN
    IF NOT EXISTS (SELECT 1 FROM dienstplan.anzeige_tokens a
                    WHERE a.token_hash = current_setting('app.dienst_anzeige', true)
                      AND a.gueltig_bis > now()) THEN
      RAISE EXCEPTION 'kameraden_namen: Anzeige-Token ungültig'
        USING ERRCODE = '42501';
    END IF;
  ELSIF v_rolle NOT IN ('Admin', 'Planer', 'Mitglied') THEN
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
