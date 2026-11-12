-- Spitzname für den Anzeigenamen (core.kameraden). ADDITIV.
--
-- Spec: docs/dienstplan/DIENSTPLAN_SPEC.md, Abschnitte 4.1 und 4.2. Der
-- Anzeigename (src/lib/mitglieder/anzeigename.ts) zeigt den Spitznamen nur, wenn
-- spitzname_anzeigen = true ist. Gepflegt wird beides in der Mitgliederverwaltung
-- (nur globaler Admin, Policies kameraden_anlegen/kameraden_aendern aus 0015).
--
-- Die beiden ALTER TABLE entsprechen dem Drizzle-Schema (Snapshot). Von Hand
-- ergänzt und idempotent:
-- - Spaltenrechte für fw_app: Seit 0013 hat fw_app INSERT/UPDATE nur auf
--   einzelne Spalten. Neue Spalten bekommen diese Rechte nicht automatisch.
-- - Änderungsprotokoll: core.kameraden_audit (0014) protokolliert zusätzlich
--   spitzname und spitzname_anzeigen (Abschnitt stammdaten). Die Funktion wird
--   vollständig ersetzt, der Trigger bleibt unverändert.
--
-- Reihenfolge beim Ausrollen: additiv, vor oder mit der App. Die alte App liest
-- die neuen Spalten nicht und schreibt sie nicht (Default false).

ALTER TABLE "core"."kameraden" ADD COLUMN "spitzname" text;--> statement-breakpoint
ALTER TABLE "core"."kameraden" ADD COLUMN "spitzname_anzeigen" boolean DEFAULT false NOT NULL;--> statement-breakpoint

GRANT INSERT (spitzname, spitzname_anzeigen) ON core.kameraden TO fw_app;--> statement-breakpoint
GRANT UPDATE (spitzname, spitzname_anzeigen) ON core.kameraden TO fw_app;--> statement-breakpoint

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
      ('psa_rolle', 'rollen'), ('food_rolle', 'rollen'), ('fk_rolle', 'rollen'), ('funk_rolle', 'rollen')
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
