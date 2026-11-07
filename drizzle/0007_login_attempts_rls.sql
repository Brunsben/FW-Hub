-- core.login_attempts: nur fw_auth (BYPASSRLS) liest/schreibt/räumt auf.
-- RLS aktiv und erzwungen, aber OHNE Policy: fw_app (NOBYPASSRLS) erhält über
-- die Default-Privileges zwar Tabellenrechte, sieht und schreibt aber nichts.
ALTER TABLE core.login_attempts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE core.login_attempts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON core.login_attempts TO fw_auth;--> statement-breakpoint
GRANT USAGE ON SEQUENCE core.login_attempts_id_seq TO fw_auth;
