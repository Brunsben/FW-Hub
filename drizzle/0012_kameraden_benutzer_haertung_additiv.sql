-- Härtung core.kameraden / core.benutzer, Teil 1 von 2: ADDITIV.
--
-- Diese Migration fügt nur hinzu (Funktionen, Trigger, zusätzliche Policies).
-- Die bestehenden Policies kameraden_scope und benutzer_scope bleiben, die
-- Tabellenrechte von fw_app bleiben. Die ALTE App läuft damit unverändert
-- weiter, die NEUE App funktioniert ebenfalls. Erst Teil 2
-- (0013_kameraden_benutzer_haertung_restriktiv.sql) nimmt Rechte weg.
--
-- Reihenfolge beim Ausrollen:  0012  ->  App  ->  0013
--
-- Alle SECURITY-DEFINER-Funktionen setzen search_path fest. Funktionen, die
-- core.benutzer oder core.kameraden an den Policies vorbei schreiben müssen
-- (Trigger, eigene PIN, eigene Sitzungen, set_karten_id), setzen
-- app.app_rolle='Admin' nur innerhalb ihres Rumpfs (transaktionslokal) und
-- stellen den vorigen Wert vor dem Verlassen wieder her. Sie funktionieren
-- dadurch auch dann, wenn der Eigentümer der Funktion RLS NICHT umgeht (weder
-- Superuser noch BYPASSRLS), obwohl FORCE ROW LEVEL SECURITY auch für ihn gilt.
-- Getestet gegen einen Eigentümer ohne BYPASSRLS.

-- ── 1. Kamerad deaktiviert -> Benutzer deaktiviert ──────────────────────────
-- Ersetzt deaktiviereBenutzerVonKamerad() aus der App. Läuft in derselben
-- Transaktion wie das UPDATE auf core.kameraden, egal wer es auslöst (PSA,
-- Skript, SQL). Behält die Schutzregeln des bisherigen App-Codes:
--   * der eigene Kamerad (app.kamerad_id) kann nicht deaktiviert werden,
--   * es bleibt mindestens ein aktiver Admin-Account (SQLSTATE FW001 -> 409).
CREATE OR REPLACE FUNCTION core.kamerad_deaktiviert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
DECLARE
  v_alt_rolle  text := current_setting('app.app_rolle', true);
  v_eigene_id  integer := NULLIF(current_setting('app.kamerad_id', true), '')::integer;
  v_ids        integer[];
  v_admin_dabei boolean;
BEGIN
  PERFORM set_config('app.app_rolle', 'Admin', true);

  -- Alle aktiven Admin-Konten sperren (feste Reihenfolge): serialisiert zwei
  -- gleichzeitige Deaktivierungen, damit nicht beide "den anderen" als
  -- verbleibenden Admin zählen.
  PERFORM 1 FROM core.benutzer WHERE rolle = 'Admin' AND aktiv ORDER BY id FOR UPDATE;

  SELECT array_agg(b.id), COALESCE(bool_or(b.rolle = 'Admin'), false)
    INTO v_ids, v_admin_dabei
    FROM (
      SELECT id, rolle FROM core.benutzer
       WHERE kamerad_id = NEW.id AND aktiv
       ORDER BY id FOR UPDATE
    ) b;

  IF v_ids IS NOT NULL THEN
    IF v_eigene_id IS NOT NULL AND NEW.id = v_eigene_id THEN
      RAISE EXCEPTION 'Der eigene Kamerad kann nicht deaktiviert werden (eigener Benutzer wäre gesperrt).'
        USING ERRCODE = 'FW001';
    END IF;

    UPDATE core.benutzer
       SET aktiv = false,
           token_version = token_version + 1,
           updated_at = now()
     WHERE id = ANY (v_ids);

    IF v_admin_dabei
       AND NOT EXISTS (SELECT 1 FROM core.benutzer WHERE rolle = 'Admin' AND aktiv) THEN
      RAISE EXCEPTION 'Der letzte aktive Admin kann nicht deaktiviert oder herabgestuft werden.'
        USING ERRCODE = 'FW001';
    END IF;
  END IF;

  PERFORM set_config('app.app_rolle', COALESCE(v_alt_rolle, ''), true);
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.kamerad_deaktiviert() FROM PUBLIC;--> statement-breakpoint
DROP TRIGGER IF EXISTS kameraden_deaktiviert_benutzer ON core.kameraden;--> statement-breakpoint
CREATE TRIGGER kameraden_deaktiviert_benutzer
  AFTER UPDATE OF aktiv ON core.kameraden
  FOR EACH ROW
  WHEN (OLD.aktiv IS TRUE AND NEW.aktiv IS FALSE)
  EXECUTE FUNCTION core.kamerad_deaktiviert();--> statement-breakpoint

-- ── 2. Rollenspalten nur über Funktion, nur für globale Admins ───────────────
-- p_rollen: JSON-Objekt mit beliebigen der Schlüssel psa_rolle, food_rolle,
-- fk_rolle, funk_rolle. JSON-null oder '' entfernt die Rolle. Nicht genannte
-- Spalten bleiben unverändert. Erhöht token_version aller verknüpften Benutzer
-- (neue Claims gelten erst nach neuem Login) und liefert deren Anzahl.
-- Welche Werte je Spalte erlaubt sind, prüft die App (lib/rollen.ts).
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
     OR (p_rollen - ARRAY['psa_rolle', 'food_rolle', 'fk_rolle', 'funk_rolle']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'set_kamerad_rollen: Objekt mit psa_rolle, food_rolle, fk_rolle und/oder funk_rolle erwartet'
      USING ERRCODE = '22023';
  END IF;

  UPDATE core.kameraden
     SET psa_rolle  = CASE WHEN p_rollen ? 'psa_rolle'  THEN NULLIF(p_rollen->>'psa_rolle', '')  ELSE psa_rolle  END,
         food_rolle = CASE WHEN p_rollen ? 'food_rolle' THEN NULLIF(p_rollen->>'food_rolle', '') ELSE food_rolle END,
         fk_rolle   = CASE WHEN p_rollen ? 'fk_rolle'   THEN NULLIF(p_rollen->>'fk_rolle', '')   ELSE fk_rolle   END,
         funk_rolle = CASE WHEN p_rollen ? 'funk_rolle' THEN NULLIF(p_rollen->>'funk_rolle', '') ELSE funk_rolle END,
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

-- ── 2b. set_karten_id: auch ohne RLS-Bypass des Eigentümers lauffähig ───────
-- Gleiche Aufgabe und gleiche Fehlercodes wie in 0005 (42501 ohne food_rolle
-- Admin, P0002 bei unbekanntem Kameraden, 23505 bei doppelter Karten-ID). Neu:
-- Die Funktion setzt app.app_rolle='Admin' für ihr UPDATE, damit
-- kameraden_aendern greift. Bisher musste der Eigentümer RLS umgehen, sonst
-- traf das UPDATE unter FORCE ROW LEVEL SECURITY keine Zeile (P0002).
-- Eigentümer und Rechte bleiben bei CREATE OR REPLACE erhalten.
CREATE OR REPLACE FUNCTION core.set_karten_id(p_kamerad_id integer, p_karten_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
DECLARE
  v_alt_rolle text := current_setting('app.app_rolle', true);
BEGIN
  IF current_setting('app.food_rolle', true) IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'set_karten_id: nur für Food-Admins'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.app_rolle', 'Admin', true);
  UPDATE core.kameraden
     SET karten_id = NULLIF(p_karten_id, ''),
         updated_at = now()
   WHERE id = p_kamerad_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_karten_id: Kamerad % nicht gefunden', p_kamerad_id
      USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('app.app_rolle', COALESCE(v_alt_rolle, ''), true);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.set_karten_id(integer, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.set_karten_id(integer, text) TO fw_app;--> statement-breakpoint

-- ── 3. Eigene PIN / eigene Sitzungen: Funktionen statt Tabellenrecht ─────────
-- Nach der Verschärfung (Teil 2) darf nur noch ein globaler Admin core.benutzer
-- schreiben. PIN-Änderung und "überall abmelden" betreffen aber die EIGENE
-- Zeile jedes Benutzers. Würde man dafür ein UPDATE auf die eigene Zeile
-- erlauben, könnte jeder Benutzer per SQL auch seine rolle ändern. Daher zwei
-- enge Funktionen: Sie ändern nur pin/token_version und nur die Zeile mit
-- kamerad_id = app.kamerad_id.
CREATE OR REPLACE FUNCTION core.eigene_pin_setzen(p_benutzer_id integer, p_pin_hash text)
RETURNS TABLE (id integer, benutzername text, rolle text, kamerad_id integer, token_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_alt_rolle text := current_setting('app.app_rolle', true);
  v_eigene_id integer := NULLIF(current_setting('app.kamerad_id', true), '')::integer;
BEGIN
  IF v_eigene_id IS NULL THEN
    RAISE EXCEPTION 'eigene_pin_setzen: kein Benutzer-Scope gesetzt'
      USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.app_rolle', 'Admin', true);
  RETURN QUERY
    WITH u AS (
      UPDATE core.benutzer b
         SET pin = p_pin_hash,
             token_version = b.token_version + 1,
             updated_at = now()
       WHERE b.id = p_benutzer_id AND b.kamerad_id = v_eigene_id AND b.aktiv
       RETURNING b.id, b.benutzername, b.rolle, b.kamerad_id, b.token_version
    )
    SELECT u.id, u.benutzername, u.rolle, u.kamerad_id, u.token_version FROM u;
  PERFORM set_config('app.app_rolle', COALESCE(v_alt_rolle, ''), true);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.eigene_pin_setzen(integer, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.eigene_pin_setzen(integer, text) TO fw_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION core.eigene_sitzungen_beenden(p_benutzer_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
DECLARE
  v_alt_rolle text := current_setting('app.app_rolle', true);
  v_eigene_id integer := NULLIF(current_setting('app.kamerad_id', true), '')::integer;
  v_anzahl integer;
BEGIN
  IF v_eigene_id IS NULL THEN
    RAISE EXCEPTION 'eigene_sitzungen_beenden: kein Benutzer-Scope gesetzt'
      USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.app_rolle', 'Admin', true);
  UPDATE core.benutzer
     SET token_version = token_version + 1,
         updated_at = now()
   WHERE id = p_benutzer_id AND kamerad_id = v_eigene_id AND aktiv;
  GET DIAGNOSTICS v_anzahl = ROW_COUNT;
  PERFORM set_config('app.app_rolle', COALESCE(v_alt_rolle, ''), true);
  RETURN v_anzahl;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.eigene_sitzungen_beenden(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.eigene_sitzungen_beenden(integer) TO fw_app;--> statement-breakpoint

-- ── 4. Neue Policies core.kameraden (zusätzlich zu kameraden_scope) ──────────
-- Endzustand nach Teil 2: eigene Zeile nur LESEN; PSA Admin/Kleiderwart und
-- globale Admins (app.app_rolle) lesen, legen an und ändern. Kein DELETE für
-- niemanden (Soft-Delete-Invariante). Die Lese-Policies für Food und Funk
-- (kameraden_food_*_read, kameraden_funk_read) bleiben unverändert.
DROP POLICY IF EXISTS kameraden_lesen ON core.kameraden;--> statement-breakpoint
CREATE POLICY kameraden_lesen ON core.kameraden
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.kamerad_id', true), '')::int
    OR current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR current_setting('app.app_rolle', true) = 'Admin'
  );--> statement-breakpoint
DROP POLICY IF EXISTS kameraden_anlegen ON core.kameraden;--> statement-breakpoint
CREATE POLICY kameraden_anlegen ON core.kameraden
  FOR INSERT
  WITH CHECK (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR current_setting('app.app_rolle', true) = 'Admin'
  );--> statement-breakpoint
DROP POLICY IF EXISTS kameraden_aendern ON core.kameraden;--> statement-breakpoint
CREATE POLICY kameraden_aendern ON core.kameraden
  FOR UPDATE
  USING (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR current_setting('app.app_rolle', true) = 'Admin'
  )
  WITH CHECK (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR current_setting('app.app_rolle', true) = 'Admin'
  );--> statement-breakpoint

-- ── 5. Neue Policies core.benutzer (übernommen aus der früheren manuellen Datei
--      drizzle/manual/benutzer-scope-verschaerfung.sql, die entfernt wurde) ──
-- Lesen: globaler Admin alles, sonst nur die eigene Zeile.
-- Anlegen, Ändern, Löschen: nur globaler Admin (app.app_rolle).
-- Hinweis: app.app_rolle ist wie alle app.*-GUCs ein von der App gesetzter
-- Wert (withGlobalAdminScope nach requireGlobalAdmin). fw_app kann ihn
-- technisch frei setzen; die Policy schützt gegen Fehler in Routen, nicht gegen
-- kompromittierten App-Code.
DROP POLICY IF EXISTS benutzer_select ON core.benutzer;--> statement-breakpoint
CREATE POLICY benutzer_select ON core.benutzer
  FOR SELECT
  USING (
    current_setting('app.app_rolle', true) = 'Admin'
    OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  );--> statement-breakpoint
DROP POLICY IF EXISTS benutzer_insert ON core.benutzer;--> statement-breakpoint
CREATE POLICY benutzer_insert ON core.benutzer
  FOR INSERT
  WITH CHECK (current_setting('app.app_rolle', true) = 'Admin');--> statement-breakpoint
DROP POLICY IF EXISTS benutzer_update ON core.benutzer;--> statement-breakpoint
CREATE POLICY benutzer_update ON core.benutzer
  FOR UPDATE
  USING (current_setting('app.app_rolle', true) = 'Admin')
  WITH CHECK (current_setting('app.app_rolle', true) = 'Admin');--> statement-breakpoint
DROP POLICY IF EXISTS benutzer_delete ON core.benutzer;--> statement-breakpoint
CREATE POLICY benutzer_delete ON core.benutzer
  FOR DELETE
  USING (current_setting('app.app_rolle', true) = 'Admin');--> statement-breakpoint

-- ── 6. Row Level Security auf den beiden Tabellen sicherstellen ─────────────
-- Bisher setzte nur drizzle/manual/rls-policies.sql ENABLE und FORCE, keine
-- Migration. Ohne RLS wären alle Policies und Spaltenrechte hier wirkungslos
-- für Zeilen. Idempotent: Wo es schon aktiv ist (Produktion), ändert es nichts.
-- Steht am Ende, damit die Policies oben schon existieren.
ALTER TABLE core.kameraden ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE core.kameraden FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE core.benutzer ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE core.benutzer FORCE ROW LEVEL SECURITY;
