-- ─────────────────────────────────────────────────────────────────────────────
--  ENTWURF (B7) — NICHT ANWENDEN. Kein Bestandteil von drizzle/ oder migrate.mjs.
--
--  Ziel: Schreibzugriff auf core.benutzer nur für den globalen Admin.
--
--  Ist-Zustand (rls-policies.sql, benutzer_scope, FOR ALL):
--    USING/WITH CHECK: app.psa_rolle IN ('Admin','Kleiderwart')
--                      OR kamerad_id = app.kamerad_id
--  Folgen:
--    * Ein PSA-Kleiderwart darf auf DB-Ebene ALLE Benutzer lesen und ändern,
--      auch rolle/pin/aktiv. Nur die Routen verhindern das.
--    * Jeder Benutzer darf seine EIGENE Zeile vollständig ändern, auch rolle.
--      Auch das verhindern nur die Routen.
--    * Ein globaler Admin ohne psa_rolle darf fremde Benutzer gar nicht
--      schreiben. Die Admin-Routen umgehen das mit withGlobalAdminScope, das
--      app.psa_rolle = 'Admin' setzt.
--
--  Nötige Scope-Änderung (Anwendung):
--    1. withGlobalAdminScope setzt bereits zusätzlich app.app_rolle = 'Admin'.
--       Die Policies unten werten NUR app.app_rolle aus. Danach muss
--       withGlobalAdminScope kein app.psa_rolle = 'Admin' mehr setzen.
--    2. Eigene PIN-Änderung und "überall abmelden" (/api/auth/pin,
--       /api/auth/abmelden-ueberall) schreiben heute die eigene Zeile direkt.
--       Künftig laufen sie über SECURITY-DEFINER-Funktionen, die nur pin bzw.
--       token_version der eigenen Zeile ändern (Muster wie core.set_karten_id):
--         core.set_own_pin(p_pin_hash text)  -- WHERE kamerad_id = app.kamerad_id
--         core.bump_own_token_version()
--    3. Die Invariante "Kamerad deaktiviert → Benutzer deaktiviert"
--       (api/psa/kameraden PATCH/DELETE) schreibt heute core.benutzer im
--       PSA-Scope (Admin/Kleiderwart). Künftig über eine SECURITY-DEFINER-
--       Funktion, die genau das tut (inkl. Letzter-Admin-Prüfung):
--         core.deactivate_benutzer_for_kamerad(p_kamerad_id integer)
--       Sie prüft app.psa_rolle IN ('Admin','Kleiderwart') selbst.
--    4. Lesen: Die Admin-Liste nutzt app.app_rolle. PSA braucht core.benutzer
--       nicht. Lesen der eigenen Zeile bleibt erlaubt (z. B. für Profilseiten).
--       Login und getAuthUser lesen über fw_auth (BYPASSRLS) und sind davon
--       nicht betroffen.
--    5. Erst-Setup (/api/auth/setup) setzt dann app.app_rolle = 'Admin' statt
--       bzw. zusätzlich zu app.psa_rolle = 'Admin'.
--
--  Reihenfolge: zuerst Schritt 1–3 und 5 in der App ausrollen, dann diese
--  Policies anwenden. Andersherum schlagen PIN-Änderung, Kamerad-
--  Deaktivierung und Setup fehl.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS benutzer_scope ON core.benutzer;

-- Lesen: globaler Admin alles, sonst nur die eigene Zeile.
CREATE POLICY benutzer_select ON core.benutzer
  FOR SELECT
  USING (
    current_setting('app.app_rolle', true) = 'Admin'
    OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  );

-- Anlegen, Ändern, Löschen: nur globaler Admin.
CREATE POLICY benutzer_insert ON core.benutzer
  FOR INSERT
  WITH CHECK (current_setting('app.app_rolle', true) = 'Admin');

CREATE POLICY benutzer_update ON core.benutzer
  FOR UPDATE
  USING (current_setting('app.app_rolle', true) = 'Admin')
  WITH CHECK (current_setting('app.app_rolle', true) = 'Admin');

CREATE POLICY benutzer_delete ON core.benutzer
  FOR DELETE
  USING (current_setting('app.app_rolle', true) = 'Admin');

COMMIT;

-- Hinweis: app.app_rolle ist wie alle app.*-GUCs ein von der App gesetzter
-- Wert. Er ist nur so vertrauenswürdig wie der Code, der ihn setzt
-- (withGlobalAdminScope nach requireGlobalAdmin → getAuthUser mit
-- token_version-Prüfung). fw_app darf ihn technisch frei setzen. Die Policy
-- schützt gegen Fehler in Routen, nicht gegen kompromittierten App-Code.
