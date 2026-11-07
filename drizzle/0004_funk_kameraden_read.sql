-- Funk-Admins/Gerätewarte dürfen core.kameraden lesen (Zuweisungsformular,
-- Besitzer-Namen in der Geräteliste). Nur SELECT; die eigene Zeile deckt
-- bereits kameraden_scope ab. Gesetzt wird app.funk_rolle durch withFunkScope.
DROP POLICY IF EXISTS kameraden_funk_read ON core.kameraden;--> statement-breakpoint
CREATE POLICY kameraden_funk_read ON core.kameraden
  FOR SELECT
  USING (current_setting('app.funk_rolle', true) IN ('Admin', 'Gerätewart'));
