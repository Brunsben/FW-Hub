-- Härtung core.kameraden / core.benutzer, Teil 2 von 2: RESTRIKTIV.
--
-- VORAUSSETZUNG: 0012 ist angewendet UND die neue App ist ausgerollt.
-- Die alte App bricht nach dieser Migration (Kameraden anlegen mit karten_id,
-- Rollen direkt schreiben, PIN-Änderung per UPDATE, deaktiviereBenutzerVonKamerad).
--
-- Reihenfolge beim Ausrollen:  0012  ->  App  ->  0013
--
-- Rücknahme (nur im Notfall, als Owner; stellt den Stand vor 0013 her):
--   GRANT INSERT, UPDATE, DELETE ON core.kameraden TO fw_app;
--   CREATE POLICY kameraden_scope ON core.kameraden FOR ALL
--     USING (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart')
--            OR id = NULLIF(current_setting('app.kamerad_id', true), '')::int)
--     WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart')
--            OR id = NULLIF(current_setting('app.kamerad_id', true), '')::int);
--   CREATE POLICY benutzer_scope ON core.benutzer FOR ALL
--     USING (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart')
--            OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int)
--     WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart')
--            OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int);

-- ── Alte, zu breite Policies entfernen ──────────────────────────────────────
-- kameraden_scope (FOR ALL): erlaubte Admin/Kleiderwart und jedem Benutzer an
--   der EIGENEN Zeile alle Schreibzugriffe. Ersetzt durch kameraden_lesen,
--   kameraden_anlegen, kameraden_aendern (0012).
-- benutzer_scope (FOR ALL): erlaubte Admin/Kleiderwart und der eigenen Zeile
--   alles. Ersetzt durch benutzer_select/insert/update/delete (0012).
DROP POLICY IF EXISTS kameraden_scope ON core.kameraden;--> statement-breakpoint
DROP POLICY IF EXISTS benutzer_scope ON core.benutzer;--> statement-breakpoint

-- ── Spaltenrechte core.kameraden für fw_app ─────────────────────────────────
-- Tabellenweite Schreibrechte entziehen, nur Stammdatenspalten zurückgeben.
--   NICHT schreibbar: karten_id        -> nur core.set_karten_id (Food-Admin)
--                     psa_rolle, food_rolle, fk_rolle, funk_rolle
--                                      -> nur core.set_kamerad_rollen (globaler Admin)
--                     id, created_at   -> Datenbank-Default
-- DELETE entfällt ganz: core.kameraden wird nie hart gelöscht (nur aktiv=false).
-- Lesen (SELECT) bleibt tabellenweit; eingeschränkt wird es durch RLS.
REVOKE INSERT, UPDATE, DELETE ON core.kameraden FROM fw_app;--> statement-breakpoint
GRANT INSERT (name, vorname, dienstgrad, email, personalnummer, aktiv)
  ON core.kameraden TO fw_app;--> statement-breakpoint
GRANT UPDATE (name, vorname, dienstgrad, email, personalnummer, aktiv, updated_at)
  ON core.kameraden TO fw_app;
