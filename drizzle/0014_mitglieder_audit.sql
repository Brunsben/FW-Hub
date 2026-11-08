-- Änderungsprotokoll der Mitgliederverwaltung: core.mitglieder_audit. ADDITIV.
--
-- Protokolliert, WER WANN WAS an Stammdaten, Zugang und Rollen eines Kameraden
-- geändert hat (Feld, alter und neuer Wert). PINs und PIN-Hashes werden nie
-- gespeichert: Eine PIN-Änderung erscheint nur als Ereignis "pin: geändert".
--
-- Die Einträge schreiben Trigger auf core.kameraden und core.benutzer, nicht die
-- Anwendung. Damit gibt es keinen Pfad ohne Protokoll: Mitglieder-Seite,
-- Admin-Routen, die Funktionen set_kamerad_rollen / set_karten_id /
-- eigene_pin_setzen, der Trigger kamerad_deaktiviert (deaktivierte Benutzer) und
-- das noch bestehende PSA-Formular laufen alle durch dieselben Trigger.
--
-- Wer: app.kamerad_id der laufenden Transaktion (NULL = System, z. B. Skript
-- oder Erst-Setup). Der Name wird als Momentaufnahme mitgespeichert.
--
-- Schutz: fw_app darf die Tabelle nur LESEN (und nur als globaler Admin über
-- RLS). Schreiben können ausschließlich die SECURITY-DEFINER-Funktionen unten,
-- Ändern und Löschen niemand. Es gibt bewusst keinen Fremdschlüssel auf
-- core.kameraden: Das Protokoll soll unabhängig von den Daten bestehen bleiben.
--
-- Tabelle und Index entsprechen dem Drizzle-Schema (src/lib/db/schema.ts, damit
-- der Snapshot stimmt). Alles weitere (RLS, Rechte, Funktionen, Trigger) ist
-- von Hand ergänzt und idempotent.
--
-- Reihenfolge beim Ausrollen: additiv, kann vor oder mit der App angewendet
-- werden. Die alte App läuft unverändert weiter.

CREATE TABLE IF NOT EXISTS core.mitglieder_audit (
  id serial PRIMARY KEY,
  zeitpunkt timestamptz NOT NULL DEFAULT now(),
  akteur_kamerad_id integer,
  akteur_name text,
  kamerad_id integer NOT NULL,
  abschnitt text NOT NULL,
  feld text NOT NULL,
  alt text,
  neu text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_mitglieder_audit_kamerad_zeit
  ON core.mitglieder_audit USING btree (kamerad_id, zeitpunkt DESC NULLS LAST);--> statement-breakpoint

ALTER TABLE core.mitglieder_audit ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE core.mitglieder_audit FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS mitglieder_audit_lesen ON core.mitglieder_audit;--> statement-breakpoint
CREATE POLICY mitglieder_audit_lesen ON core.mitglieder_audit
  FOR SELECT
  USING (current_setting('app.app_rolle', true) = 'Admin');--> statement-breakpoint
DROP POLICY IF EXISTS mitglieder_audit_schreiben ON core.mitglieder_audit;--> statement-breakpoint
CREATE POLICY mitglieder_audit_schreiben ON core.mitglieder_audit
  FOR INSERT
  WITH CHECK (current_setting('app.app_rolle', true) = 'Admin');--> statement-breakpoint

-- ALTER DEFAULT PRIVILEGES hat fw_app automatisch alle Rechte gegeben. Zurück
-- auf nur Lesen; die Sequenz braucht fw_app nicht (es schreibt nur der Trigger).
REVOKE ALL ON core.mitglieder_audit FROM fw_app;--> statement-breakpoint
GRANT SELECT ON core.mitglieder_audit TO fw_app;--> statement-breakpoint
REVOKE ALL ON SEQUENCE core.mitglieder_audit_id_seq FROM fw_app;--> statement-breakpoint

-- ── Schreib-Funktion (nur intern, von den Triggern aufgerufen) ──────────────
-- Setzt app.app_rolle='Admin' nur im Rumpf (wie die anderen Funktionen), damit
-- die INSERT-Policy auch dann greift, wenn der Eigentümer RLS nicht umgeht.
CREATE OR REPLACE FUNCTION core.audit_schreiben(
  p_kamerad integer, p_abschnitt text, p_feld text, p_alt text, p_neu text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
DECLARE
  v_alt_rolle text := current_setting('app.app_rolle', true);
  v_akteur integer := NULLIF(current_setting('app.kamerad_id', true), '')::integer;
  v_name text;
BEGIN
  PERFORM set_config('app.app_rolle', 'Admin', true);
  IF v_akteur = 0 THEN
    v_akteur := NULL;  -- Erst-Setup arbeitet mit kamerad_id 0: kein echter Akteur
  END IF;
  IF v_akteur IS NOT NULL THEN
    SELECT k.vorname || ' ' || k.name INTO v_name FROM core.kameraden k WHERE k.id = v_akteur;
  END IF;
  INSERT INTO core.mitglieder_audit (akteur_kamerad_id, akteur_name, kamerad_id, abschnitt, feld, alt, neu)
  VALUES (v_akteur, v_name, p_kamerad, p_abschnitt, p_feld, p_alt, p_neu);
  PERFORM set_config('app.app_rolle', COALESCE(v_alt_rolle, ''), true);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.audit_schreiben(integer, text, text, text, text) FROM PUBLIC;--> statement-breakpoint

-- ── Trigger core.kameraden ───────────────────────────────────────────────────
-- Stammdaten: vorname, name, dienstgrad, email, personalnummer, karten_id, aktiv.
-- Rollen: psa_rolle, food_rolle, fk_rolle, funk_rolle. Nicht protokolliert:
-- id, created_at, updated_at.
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
REVOKE ALL ON FUNCTION core.kameraden_audit() FROM PUBLIC;--> statement-breakpoint
DROP TRIGGER IF EXISTS kameraden_audit ON core.kameraden;--> statement-breakpoint
CREATE TRIGGER kameraden_audit
  AFTER INSERT OR UPDATE ON core.kameraden
  FOR EACH ROW
  EXECUTE FUNCTION core.kameraden_audit();--> statement-breakpoint

-- ── Trigger core.benutzer ────────────────────────────────────────────────────
-- Zugang: Login angelegt, benutzername, rolle, aktiv. Die PIN (pin) erscheint nur
-- als Ereignis ohne Wert. Nicht protokolliert: token_version, updated_at.
CREATE OR REPLACE FUNCTION core.benutzer_audit()
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
    PERFORM core.audit_schreiben(NEW.kamerad_id, 'zugang', 'login angelegt', NULL,
                                 NEW.benutzername || ' (' || NEW.rolle || ')');
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  n := to_jsonb(NEW);
  FOR f IN
    SELECT * FROM (VALUES ('benutzername'), ('rolle'), ('aktiv')) AS t(feld)
  LOOP
    IF o -> f.feld IS DISTINCT FROM n -> f.feld THEN
      PERFORM core.audit_schreiben(NEW.kamerad_id, 'zugang', f.feld, o ->> f.feld, n ->> f.feld);
    END IF;
  END LOOP;
  IF OLD.pin IS DISTINCT FROM NEW.pin THEN
    PERFORM core.audit_schreiben(NEW.kamerad_id, 'zugang', 'pin', NULL, 'geändert');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.benutzer_audit() FROM PUBLIC;--> statement-breakpoint
DROP TRIGGER IF EXISTS benutzer_audit ON core.benutzer;--> statement-breakpoint
CREATE TRIGGER benutzer_audit
  AFTER INSERT OR UPDATE ON core.benutzer
  FOR EACH ROW
  EXECUTE FUNCTION core.benutzer_audit();
