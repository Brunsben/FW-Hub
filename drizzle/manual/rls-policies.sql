-- ─────────────────────────────────────────────────────────────
--  rls-policies.sql  (manuell auszuführen, NICHT von drizzle-kit)
--
--  Aktiviert RLS auf den drei Test-Tabellen und legt Policies an,
--  die die per set_config gesetzten Session-GUCs auswerten:
--    app.kamerad_id  – integer als text
--    app.psa_rolle   – 'Admin' | 'Kleiderwart' | 'User'
--
--  Regel: Admin/Kleiderwart sehen/ändern alles, User nur die eigene
--  kamerad_id. FORCE RLS gilt auch für den Tabellen-Eigentümer.
--
--  ⚠️  WARNUNG: Sobald DATABASE_URL auf fw_app zeigt UND diese Policies
--  aktiv sind, benötigt JEDER Zugriff auf diese Tabellen einen gesetzten
--  Scope (withScope). Routen ohne Scope (inkl. Login, das core.benutzer
--  liest) sehen sonst nichts / dürfen nichts. Siehe Begleittext.
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- Hilfsausdrücke inline: NULLIF(...,'')::int ergibt NULL, wenn nicht gesetzt.

-- ── core.kameraden ────────────────────────────────────────────
ALTER TABLE core.kameraden ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.kameraden FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kameraden_scope ON core.kameraden;
CREATE POLICY kameraden_scope ON core.kameraden
  FOR ALL
  USING (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  );

-- ── core.benutzer ─────────────────────────────────────────────
ALTER TABLE core.benutzer ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.benutzer FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS benutzer_scope ON core.benutzer;
CREATE POLICY benutzer_scope ON core.benutzer
  FOR ALL
  USING (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  );

-- ── psa.ausruestungstuecke ────────────────────────────────────
ALTER TABLE psa.ausruestungstuecke ENABLE ROW LEVEL SECURITY;
ALTER TABLE psa.ausruestungstuecke FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ausruestungstuecke_scope ON psa.ausruestungstuecke;
CREATE POLICY ausruestungstuecke_scope ON psa.ausruestungstuecke
  FOR ALL
  USING (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.psa_rolle', true) IN ('Admin', 'Kleiderwart')
    OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int
  );

COMMIT;
