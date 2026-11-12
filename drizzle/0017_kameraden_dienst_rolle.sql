-- Modulrolle Dienstplan: core.kameraden.dienst_rolle. ADDITIV.
--
-- Spec: docs/dienstplan/DIENSTPLAN_SPEC.md, Abschnitt 6. Werte Admin | Planer |
-- Mitglied (Entscheidung 11.11.2026, groß wie die anderen Modulrollen). NULL gilt
-- im Modul als Mitglied (src/lib/dienstplan/auth.ts).
--
-- Wie die anderen Rollenspalten schreibt nur core.set_kamerad_rollen die Spalte
-- (globaler Admin, /api/admin/rollen/[kameradId]). fw_app bekommt bewusst KEIN
-- Spaltenrecht INSERT/UPDATE (seit 0013 nur Stammdatenspalten).
--
-- Die ALTER TABLE entspricht dem Drizzle-Schema. Von Hand ergänzt, idempotent:
-- - core.set_kamerad_rollen kennt den Schlüssel dienst_rolle (Funktion
--   vollständig ersetzt, sonst unverändert gegenüber 0012)
-- - core.kameraden_audit protokolliert dienst_rolle im Abschnitt rollen
--   (Funktion vollständig ersetzt, Stand 0016 plus dienst_rolle)
--
-- Reihenfolge beim Ausrollen: additiv, vor oder mit der App.

ALTER TABLE "core"."kameraden" ADD COLUMN "dienst_rolle" text;--> statement-breakpoint

CREATE OR REPLACE FUNCTION core.set_kamerad_rollen(p_kamerad_id integer, p_rollen jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
DECLARE
  v_alt_rolle text := current_setting('app.app_rolle', true);
  v_anzahl integer;
BEGIN
  IF v_alt_rolle IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'set_kamerad_rollen: nur für globale Admins'
      USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rollen) IS DISTINCT FROM 'object'
     OR p_rollen = '{}'::jsonb
     OR (p_rollen - ARRAY['psa_rolle', 'food_rolle', 'fk_rolle', 'funk_rolle', 'dienst_rolle']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'set_kamerad_rollen: Objekt mit psa_rolle, food_rolle, fk_rolle, funk_rolle und/oder dienst_rolle erwartet'
      USING ERRCODE = '22023';
  END IF;

  UPDATE core.kameraden
     SET psa_rolle    = CASE WHEN p_rollen ? 'psa_rolle'    THEN NULLIF(p_rollen->>'psa_rolle', '')    ELSE psa_rolle    END,
         food_rolle   = CASE WHEN p_rollen ? 'food_rolle'   THEN NULLIF(p_rollen->>'food_rolle', '')   ELSE food_rolle   END,
         fk_rolle     = CASE WHEN p_rollen ? 'fk_rolle'     THEN NULLIF(p_rollen->>'fk_rolle', '')     ELSE fk_rolle     END,
         funk_rolle   = CASE WHEN p_rollen ? 'funk_rolle'   THEN NULLIF(p_rollen->>'funk_rolle', '')   ELSE funk_rolle   END,
         dienst_rolle = CASE WHEN p_rollen ? 'dienst_rolle' THEN NULLIF(p_rollen->>'dienst_rolle', '') ELSE dienst_rolle END,
         updated_at = now()
   WHERE id = p_kamerad_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_kamerad_rollen: Kamerad % nicht gefunden', p_kamerad_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE core.benutzer
     SET token_version = token_version + 1,
         updated_at = now()
   WHERE kamerad_id = p_kamerad_id;
  GET DIAGNOSTICS v_anzahl = ROW_COUNT;
  RETURN v_anzahl;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.set_kamerad_rollen(integer, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.set_kamerad_rollen(integer, jsonb) TO fw_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION core.kameraden_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
DECLARE
  f record;
  o jsonb;
  n jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM core.audit_schreiben(NEW.id, 'stammdaten', 'angelegt', NULL, NEW.vorname || ' ' || NEW.name);
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  n := to_jsonb(NEW);
  FOR f IN
    SELECT * FROM (VALUES
      ('vorname', 'stammdaten'), ('name', 'stammdaten'), ('dienstgrad', 'stammdaten'),
      ('email', 'stammdaten'), ('personalnummer', 'stammdaten'), ('karten_id', 'stammdaten'),
      ('spitzname', 'stammdaten'), ('spitzname_anzeigen', 'stammdaten'),
      ('aktiv', 'stammdaten'),
      ('psa_rolle', 'rollen'), ('food_rolle', 'rollen'), ('fk_rolle', 'rollen'), ('funk_rolle', 'rollen'),
      ('dienst_rolle', 'rollen')
    ) AS t(feld, abschnitt)
  LOOP
    IF o -> f.feld IS DISTINCT FROM n -> f.feld THEN
      PERFORM core.audit_schreiben(NEW.id, f.abschnitt, f.feld, o ->> f.feld, n ->> f.feld);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.kameraden_audit() FROM PUBLIC;
