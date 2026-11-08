-- Kameraden anlegen und ändern NUR NOCH für globale Admins. RESTRIKTIV.
--
-- Bisher durften auch PSA Admin und Kleiderwart core.kameraden anlegen und
-- ändern (Stammdaten, Deaktivieren). Mit der zentralen Mitgliederverwaltung
-- (/mitglieder, Pakete 1-6) gibt es dafür nur noch einen Weg:
-- /api/mitglieder im Scope eines globalen Admins (app.app_rolle = 'Admin').
-- Diese Migration zieht das in der Datenbank nach: kameraden_anlegen und
-- kameraden_aendern erlauben nur noch app_rolle = 'Admin'. Lesen bleibt für PSA
-- Admin/Kleiderwart, Küche und Funk unverändert (kameraden_lesen und die
-- Lese-Policies der Module).
--
-- Nicht betroffen, weil sie als SECURITY-DEFINER-Funktionen mit eigener Prüfung
-- laufen: set_karten_id (Küchen-Admin), set_kamerad_rollen (globaler Admin),
-- eigene_pin_setzen, der Deaktivierungs-Trigger und das Änderungsprotokoll.
-- Größen (psa.kamerad_details) liegen in einer anderen Tabelle und bleiben bei
-- PSA Admin/Kleiderwart.
--
-- VORAUSSETZUNG: Die App mit den Paketen 4 und 5 läuft (Kameradenformular im
-- PSA entfernt, Routen POST/PATCH/DELETE /api/psa/kameraden entfernt). Die ALTE
-- App kann nach dieser Migration keine Kameraden mehr als Kleiderwart anlegen
-- oder ändern.
--
-- Reihenfolge beim Ausrollen:  App  ->  0015
--
-- RÜCKNAHME (nur im Notfall, als Owner; stellt den Stand vor 0015 her). Der
-- Eintrag für 0015 bleibt in drizzle.__drizzle_migrations bestehen:
--   DROP POLICY kameraden_anlegen ON core.kameraden;
--   CREATE POLICY kameraden_anlegen ON core.kameraden FOR INSERT
--     WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
--              OR current_setting('app.app_rolle', true) = 'Admin');
--   DROP POLICY kameraden_aendern ON core.kameraden;
--   CREATE POLICY kameraden_aendern ON core.kameraden FOR UPDATE
--     USING (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
--         OR current_setting('app.app_rolle', true) = 'Admin')
--     WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
--              OR current_setting('app.app_rolle', true) = 'Admin');

DROP POLICY IF EXISTS kameraden_anlegen ON core.kameraden;--> statement-breakpoint
CREATE POLICY kameraden_anlegen ON core.kameraden
  FOR INSERT
  WITH CHECK (current_setting('app.app_rolle', true) = 'Admin');--> statement-breakpoint

DROP POLICY IF EXISTS kameraden_aendern ON core.kameraden;--> statement-breakpoint
CREATE POLICY kameraden_aendern ON core.kameraden
  FOR UPDATE
  USING (current_setting('app.app_rolle', true) = 'Admin')
  WITH CHECK (current_setting('app.app_rolle', true) = 'Admin');
