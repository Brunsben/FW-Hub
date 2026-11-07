-- RLS für psa.schadensdokumentation und psa.kamerad_details sowie Austausch der
-- Policy auf psa.ausruestungstuecke gegen das Muster der übrigen PSA-Tabellen:
--   <t>_priv          FOR ALL    : app.psa_rolle Admin/Kleiderwart lesen und schreiben alles
--   <t>_eigene_lesen  FOR SELECT : sonst nur eigene Zeilen LESEN; User schreiben nie
-- Keine GRANTs. RLS auf psa.ausruestungstuecke ist bereits aktiv (rls-policies.sql).

-- ── psa.ausruestungstuecke: ausruestungstuecke_scope (FOR ALL, inkl. eigener
--    Schreibrechte) ersetzen. Auf dem Server über drizzle/manual/rls-policies.sql
--    angelegt, daher IF EXISTS.
DROP POLICY IF EXISTS ausruestungstuecke_scope ON psa.ausruestungstuecke;--> statement-breakpoint
CREATE POLICY ausruestungstuecke_priv ON psa.ausruestungstuecke
  FOR ALL
  USING (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'))
  WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'));--> statement-breakpoint
CREATE POLICY ausruestungstuecke_eigene_lesen ON psa.ausruestungstuecke
  FOR SELECT
  USING (kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int);--> statement-breakpoint

-- ── psa.schadensdokumentation: keine eigene kamerad_id → Bezug über den
--    aktuellen Träger des Stücks. Die Unterabfrage läuft selbst unter der RLS
--    von psa.ausruestungstuecke (für User: eigene Stücke sichtbar).
ALTER TABLE psa.schadensdokumentation ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE psa.schadensdokumentation FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY schadensdokumentation_priv ON psa.schadensdokumentation
  FOR ALL
  USING (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'))
  WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'));--> statement-breakpoint
CREATE POLICY schadensdokumentation_eigene_lesen ON psa.schadensdokumentation
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM psa.ausruestungstuecke s
    WHERE s.id = ausruestungstueck_id
      AND s.kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  ));--> statement-breakpoint

-- ── psa.kamerad_details (Größen): User lesen die eigene Zeile, schreiben nie.
ALTER TABLE psa.kamerad_details ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE psa.kamerad_details FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY kamerad_details_priv ON psa.kamerad_details
  FOR ALL
  USING (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'))
  WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart'));--> statement-breakpoint
CREATE POLICY kamerad_details_eigene_lesen ON psa.kamerad_details
  FOR SELECT
  USING (kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int);
