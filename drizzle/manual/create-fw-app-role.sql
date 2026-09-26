-- ─────────────────────────────────────────────────────────────
--  create-fw-app-role.sql  (manuell auszuführen, NICHT von drizzle-kit)
--
--  Legt die Anwendungs-Rolle fw_app an. Diese Rolle unterliegt RLS
--  (NOBYPASSRLS) und wird künftig in DATABASE_URL verwendet.
--
--  VOR DEM AUSFÜHREN: <PLATZHALTER> durch ein echtes Passwort ersetzen
--  und dasselbe Passwort in DATABASE_URL eintragen.
--
--  Ausführen als Schema-Eigentümer (z.B. nocodb):
--    docker exec -i <pg_container> psql -U nocodb -d nocodb \
--      -f /dev/stdin < drizzle/manual/create-fw-app-role.sql
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fw_app') THEN
    CREATE ROLE fw_app LOGIN PASSWORD '<PLATZHALTER_FW_APP_PASSWORT>' NOBYPASSRLS;
  ELSE
    ALTER ROLE fw_app WITH LOGIN PASSWORD '<PLATZHALTER_FW_APP_PASSWORT>' NOBYPASSRLS;
  END IF;
END
$$;

-- Schema-Zugriff
GRANT USAGE ON SCHEMA core, psa, fw_funk TO fw_app;

-- Rechte auf bestehende Tabellen
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO fw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA psa TO fw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fw_funk TO fw_app;

-- Sequenzen (für serial-PKs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO fw_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA psa TO fw_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA fw_funk TO fw_app;

-- Künftige Tabellen/Sequenzen automatisch mitberechtigen.
-- Gilt für Objekte, die der ausführende Eigentümer (nocodb) neu anlegt —
-- also die von drizzle-kit erzeugten Migrationen.
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fw_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA psa
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fw_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA fw_funk
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fw_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT USAGE, SELECT ON SEQUENCES TO fw_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA psa
  GRANT USAGE, SELECT ON SEQUENCES TO fw_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA fw_funk
  GRANT USAGE, SELECT ON SEQUENCES TO fw_app;

-- ─────────────────────────────────────────────────────────────
--  Login-Rolle fw_auth: umgeht RLS (BYPASSRLS), damit der Login
--  funktioniert, BEVOR ein Scope bekannt ist. Streng minimiert:
--  darf ausschließlich core.benutzer LESEN — sonst nichts.
--  <PLATZHALTER_FW_AUTH_PASSWORT> vor dem Ausführen ersetzen und in
--  AUTH_DATABASE_URL eintragen.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fw_auth') THEN
    CREATE ROLE fw_auth LOGIN PASSWORD '<PLATZHALTER_FW_AUTH_PASSWORT>' BYPASSRLS;
  ELSE
    ALTER ROLE fw_auth WITH LOGIN PASSWORD '<PLATZHALTER_FW_AUTH_PASSWORT>' BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA core TO fw_auth;
GRANT SELECT ON core.benutzer TO fw_auth;
-- Bewusst KEIN Zugriff auf core.kameraden, psa.*, fw_funk.* und kein
-- INSERT/UPDATE/DELETE. fw_auth dient allein dem Benutzer-Lookup beim Login.

