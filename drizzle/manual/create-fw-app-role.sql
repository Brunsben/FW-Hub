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
-- INSERT/UPDATE/DELETE auf core.benutzer. fw_auth dient dem Benutzer-Lookup
-- beim Login.
--
-- Ausnahme (seit Login-Sperre, per Migration drizzle/0007_login_attempts_rls.sql,
-- hier nur zur Dokumentation):
--   GRANT SELECT, INSERT, DELETE ON core.login_attempts TO fw_auth;
--   GRANT USAGE ON SEQUENCE core.login_attempts_id_seq TO fw_auth;
-- Siehe drizzle/manual/login-sperre.md.
--
-- WICHTIG: Die ALTER DEFAULT PRIVILEGES oben geben fw_app auf JEDE neue
-- Tabelle/Sequenz in core, psa und fw_funk automatisch Rechte. Tabellen, die
-- nur fw_auth gehören sollen (z. B. core.login_attempts), müssen nach dem
-- Anlegen bereinigt werden:
--   REVOKE ALL ON core.<tabelle> FROM fw_app;
--   REVOKE ALL ON SEQUENCE core.<tabelle>_id_seq FROM fw_app;
-- Für core.login_attempts erledigt das drizzle/0009_login_attempts_revoke_fw_app.sql.

-- ─────────────────────────────────────────────────────────────
--  Einschränkungen, die ein erneuter Lauf NICHT zurücksetzen darf.
--  Die tabellenweiten GRANTs weiter oben (ON ALL TABLES) geben fw_app wieder
--  alles. Dieser Block nimmt es zurück. Er steht bewusst am Ende der Datei und
--  ist idempotent. Jede Einschränkung gilt nur, wenn die Tabelle existiert
--  (das Skript darf vor den Migrationen laufen) und die zugehörige Migration
--  angewendet ist (sonst bräche die laufende App).
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- core.login_attempts gehört nur fw_auth (Migration 0009).
  IF to_regclass('core.login_attempts') IS NOT NULL THEN
    REVOKE ALL ON core.login_attempts FROM fw_app;
  END IF;
  IF to_regclass('core.login_attempts_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE core.login_attempts_id_seq FROM fw_app;
  END IF;

  -- Änderungsprotokoll core.mitglieder_audit (Migration 0014): fw_app darf nur
  -- lesen. Schreiben tun ausschließlich die Trigger-Funktionen.
  IF to_regclass('core.mitglieder_audit') IS NOT NULL THEN
    REVOKE ALL ON core.mitglieder_audit FROM fw_app;
    GRANT SELECT ON core.mitglieder_audit TO fw_app;
  END IF;
  IF to_regclass('core.mitglieder_audit_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE core.mitglieder_audit_id_seq FROM fw_app;
  END IF;

  -- Spaltenrechte core.kameraden (Migration 0013): nur Stammdatenspalten.
  -- "0013 angewendet" erkennt man daran, dass kameraden_scope entfernt ist und
  -- kameraden_aendern (aus 0012) existiert. Ohne diese Bedingung würde ein
  -- Lauf zwischen 0012 und 0013 die alte App brechen.
  IF to_regclass('core.kameraden') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname = 'core' AND tablename = 'kameraden'
                        AND policyname = 'kameraden_scope')
     AND EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'core' AND tablename = 'kameraden'
                    AND policyname = 'kameraden_aendern') THEN
    -- Das REVOKE auf Tabellenebene entzieht auch alle Spaltenrechte.
    REVOKE INSERT, UPDATE, DELETE ON core.kameraden FROM fw_app;
    GRANT INSERT (name, vorname, dienstgrad, email, personalnummer, aktiv)
      ON core.kameraden TO fw_app;
    GRANT UPDATE (name, vorname, dienstgrad, email, personalnummer, aktiv, updated_at)
      ON core.kameraden TO fw_app;
  END IF;
END
$$;
