-- RLS für die PSA-Historientabellen ausgaben, pruefungen, waesche.
--
-- Muster je Tabelle (zwei permissive Policies):
--   <t>_priv          FOR ALL    : app.psa_rolle Admin/Kleiderwart lesen und schreiben alles
--   <t>_eigene_lesen  FOR SELECT : sonst nur Zeilen mit kamerad_id = app.kamerad_id LESEN
-- User schreiben nie (wie in der App: canEdit). Bewusst strenger als
-- ausruestungstuecke_scope (FOR ALL inkl. eigener Zeilen).
-- Keine GRANTs, keine Änderungen an anderen Tabellen.

ALTER TABLE psa.ausgaben ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE psa.ausgaben FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ausgaben_priv ON psa.ausgaben
  FOR ALL
  USING (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'))
  WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'));--> statement-breakpoint
CREATE POLICY ausgaben_eigene_lesen ON psa.ausgaben
  FOR SELECT
  USING (kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int);--> statement-breakpoint

ALTER TABLE psa.pruefungen ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE psa.pruefungen FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY pruefungen_priv ON psa.pruefungen
  FOR ALL
  USING (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'))
  WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'));--> statement-breakpoint
CREATE POLICY pruefungen_eigene_lesen ON psa.pruefungen
  FOR SELECT
  USING (kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int);--> statement-breakpoint

ALTER TABLE psa.waesche ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE psa.waesche FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY waesche_priv ON psa.waesche
  FOR ALL
  USING (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'))
  WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'));--> statement-breakpoint
CREATE POLICY waesche_eigene_lesen ON psa.waesche
  FOR SELECT
  USING (kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int);
