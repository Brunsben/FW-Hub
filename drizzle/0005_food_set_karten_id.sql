-- core.set_karten_id: einziger Schreibweg des Food-Moduls auf core.kameraden.
--
-- Food-Admins dürfen laut RLS core.kameraden nur LESEN (kameraden_food_admin_read).
-- Statt einer UPDATE-Policy (RLS kann nicht auf eine Spalte beschränken) ändert
-- diese SECURITY-DEFINER-Funktion ausschließlich karten_id und updated_at.
--
-- Voraussetzungen:
--   * Aufrufer hat app.food_rolle = 'Admin' gesetzt (withFoodScope), sonst
--     SQLSTATE 42501 (insufficient_privilege).
--   * kamerad_id existiert, sonst SQLSTATE P0002 (no_data_found).
--   * Eine bereits vergebene karten_id führt zu 23505 (idx_kameraden_karten_id).
--
-- WICHTIG: Der Eigentümer der Funktion muss FORCE ROW LEVEL SECURITY auf
-- core.kameraden umgehen (Superuser oder BYPASSRLS), siehe
-- drizzle/manual/set-karten-id-owner.md.
CREATE OR REPLACE FUNCTION core.set_karten_id(p_kamerad_id integer, p_karten_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
BEGIN
  IF current_setting('app.food_rolle', true) IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'set_karten_id: nur für Food-Admins'
      USING ERRCODE = '42501';
  END IF;

  UPDATE core.kameraden
     SET karten_id = NULLIF(p_karten_id, ''),
         updated_at = now()
   WHERE id = p_kamerad_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_karten_id: Kamerad % nicht gefunden', p_kamerad_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION core.set_karten_id(integer, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.set_karten_id(integer, text) TO fw_app;
