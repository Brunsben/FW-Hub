-- core.login_attempts gehört ausschließlich fw_auth. ALTER DEFAULT PRIVILEGES
-- (create-fw-app-role.sql) hat fw_app beim Anlegen automatisch arwd auf Tabelle
-- und Sequenz gegeben. RLS ohne Policy schützt bereits; die Rechte sollen es
-- zusätzlich tun.
REVOKE ALL ON core.login_attempts FROM fw_app;--> statement-breakpoint
REVOKE ALL ON SEQUENCE core.login_attempts_id_seq FROM fw_app;
