-- ─────────────────────────────────────────────────────────────
--  rls-policies-food.sql  (manuell auszuführen, NICHT von drizzle-kit)
--
--  RLS für die personenbezogenen fw_food-Tabellen. Muster: Admin ODER
--  öffentlich-vertrauenswürdig (Kiosk/Mobile markieren sich per food_public).
--    app.food_rolle  = 'Admin'   → Food-Admin-Scope (withFoodScope)
--    app.food_public = 'true'    → login-freier Kiosk/Mobile (withFoodPublicScope)
--
--  fw_food.menus / guests / preset_menus / admin_log bleiben BEWUSST OHNE RLS:
--  reine Verwaltungsdaten ohne Personenbezug, admin-only durch Anwendungslogik.
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- ── fw_food.registrations ─────────────────────────────────────
ALTER TABLE fw_food.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fw_food.registrations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registrations_access ON fw_food.registrations;
CREATE POLICY registrations_access ON fw_food.registrations
  FOR ALL
  USING (
    current_setting('app.food_rolle', true) = 'Admin'
    OR current_setting('app.food_public', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.food_rolle', true) = 'Admin'
    OR current_setting('app.food_public', true) = 'true'
  );

-- ── fw_food.mobile_tokens ─────────────────────────────────────
ALTER TABLE fw_food.mobile_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fw_food.mobile_tokens FORCE ROW LEVEL SECURITY;

-- Lesen: Admin ODER öffentlicher Mobile-Zugriff (Token-Lookup).
DROP POLICY IF EXISTS mobile_tokens_read ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_read ON fw_food.mobile_tokens
  FOR SELECT
  USING (
    current_setting('app.food_rolle', true) = 'Admin'
    OR current_setting('app.food_public', true) = 'true'
  );

-- Schreiben (Anlegen/Ersetzen/Löschen): ausschließlich Admin.
DROP POLICY IF EXISTS mobile_tokens_write_insert ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_write_insert ON fw_food.mobile_tokens
  FOR INSERT
  WITH CHECK (current_setting('app.food_rolle', true) = 'Admin');

DROP POLICY IF EXISTS mobile_tokens_write_update ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_write_update ON fw_food.mobile_tokens
  FOR UPDATE
  USING (current_setting('app.food_rolle', true) = 'Admin')
  WITH CHECK (current_setting('app.food_rolle', true) = 'Admin');

DROP POLICY IF EXISTS mobile_tokens_write_delete ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_write_delete ON fw_food.mobile_tokens
  FOR DELETE
  USING (current_setting('app.food_rolle', true) = 'Admin');

-- ── core.kameraden: Lese-Erlaubnis für food_public ────────────
-- register (POST/DELETE) und die Mobile-Seite lesen core.kameraden unter dem
-- food_public-Scope. Die bestehende core.kameraden-Policy deckt nur
-- psa_rolle/kamerad_id ab; ohne diese permissive SELECT-Policy lieferten die
-- Lookups 0 Zeilen (nur relevant, wenn core.kameraden-RLS aktiv ist).
DROP POLICY IF EXISTS kameraden_food_public_read ON core.kameraden;
CREATE POLICY kameraden_food_public_read ON core.kameraden
  FOR SELECT
  USING (current_setting('app.food_public', true) = 'true');

-- Food-Admins (stats/export etc.) dürfen core.kameraden NUR lesen. Eigene
-- permissive SELECT-Policy — die bestehende kameraden_scope-Policy bleibt für
-- INSERT/UPDATE/DELETE allein maßgeblich (kein Schreibzugriff über food_rolle).
DROP POLICY IF EXISTS kameraden_food_admin_read ON core.kameraden;
CREATE POLICY kameraden_food_admin_read ON core.kameraden
  FOR SELECT
  USING (current_setting('app.food_rolle', true) = 'Admin');

COMMIT;
