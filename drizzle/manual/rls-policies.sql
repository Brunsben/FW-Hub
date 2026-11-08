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
--
-- Weitere Policies auf core.kameraden liegen NICHT in dieser Datei:
--   kameraden_food_public_read, kameraden_food_admin_read → rls-policies-food.sql
--   kameraden_funk_read → drizzle/0004_funk_kameraden_read.sql (via migrate.mjs)
--
-- Die Policies aller PSA-Tabellen liegen in Migrationen (via migrate.mjs):
--   drizzle/0010_psa_historie_rls.sql            psa.ausgaben, pruefungen, waesche
--   drizzle/0011_psa_schaden_details_stuecke_rls.sql
--                                                psa.schadensdokumentation,
--                                                psa.kamerad_details und Austausch
--                                                der Policy auf psa.ausruestungstuecke
-- Einheitliches Muster:
--   <t>_priv         FOR ALL    Admin/Kleiderwart lesen und schreiben alles
--   <t>_eigene_lesen FOR SELECT sonst nur eigene Zeilen LESEN (kamerad_id =
--                               app.kamerad_id; Schäden über den Träger des Stücks)
-- User schreiben in PSA-Tabellen nie.

-- ── core.kameraden ────────────────────────────────────────────
ALTER TABLE core.kameraden ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.kameraden FORCE ROW LEVEL SECURITY;

-- Die Policies auf core.kameraden und core.benutzer liegen NICHT mehr hier.
-- Die frühere kameraden_scope / benutzer_scope (FOR ALL, inkl. Schreibrechten
-- für die eigene Zeile und für Kleiderwart) sind durch die Migrationen
-- drizzle/0012_kameraden_benutzer_haertung_additiv.sql und
-- drizzle/0013_kameraden_benutzer_haertung_restriktiv.sql ersetzt. Diese Datei
-- legt sie bewusst NICHT mehr an – sonst würde ein erneutes Ausführen die
-- Härtung rückgängig machen.

-- ── core.benutzer ─────────────────────────────────────────────
ALTER TABLE core.benutzer ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.benutzer FORCE ROW LEVEL SECURITY;


-- ── psa.ausruestungstuecke ────────────────────────────────────
-- RLS bleibt hier aktiviert (idempotent). Die frühere Policy
-- ausruestungstuecke_scope (FOR ALL, User durften eigene Stücke schreiben) ist
-- ENTFALLEN: drizzle/0011_psa_schaden_details_stuecke_rls.sql löscht sie und
-- legt ausruestungstuecke_priv / ausruestungstuecke_eigene_lesen an.
-- Diese Datei legt sie bewusst NICHT mehr an – sonst würde ein erneutes
-- Ausführen die lockerere Policy permissiv (ODER-verknüpft) zurückbringen.
ALTER TABLE psa.ausruestungstuecke ENABLE ROW LEVEL SECURITY;
ALTER TABLE psa.ausruestungstuecke FORCE ROW LEVEL SECURITY;

COMMIT;
