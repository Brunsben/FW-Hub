CREATE TABLE "core"."login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"benutzername" text NOT NULL,
	"ip" text,
	"erfolgreich" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_login_attempts_benutzer_zeit" ON "core"."login_attempts" USING btree ("benutzername","created_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip_zeit" ON "core"."login_attempts" USING btree ("ip","created_at");