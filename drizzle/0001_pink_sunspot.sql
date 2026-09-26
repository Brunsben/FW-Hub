CREATE SCHEMA "psa";
--> statement-breakpoint
CREATE TABLE "psa"."ausgaben" (
	"id" serial PRIMARY KEY NOT NULL,
	"ausruestungstueck_id" integer,
	"kamerad_id" integer,
	"ausgabedatum" date,
	"rueckgabedatum" date,
	"notizen" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa"."ausruestungstuecke" (
	"id" serial PRIMARY KEY NOT NULL,
	"ausruestungstyp_id" integer,
	"seriennummer" text,
	"status" text,
	"kaufdatum" date,
	"herstellungsdatum" date,
	"naechste_pruefung" date,
	"letzte_pruefung" date,
	"lebensende_datum" date,
	"qr_code" text,
	"waesche_anzahl" integer DEFAULT 0 NOT NULL,
	"groesse" text,
	"notizen" text,
	"kamerad_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa"."ausruestungstypen" (
	"id" serial PRIMARY KEY NOT NULL,
	"bezeichnung" text NOT NULL,
	"typ" text,
	"pruefintervall_monate" integer,
	"max_lebensdauer_jahre" integer,
	"max_waeschen" integer,
	"norm" text,
	"foto" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa"."changelog" (
	"id" serial PRIMARY KEY NOT NULL,
	"tabelle" text,
	"aktion" text,
	"details" text,
	"benutzer" text,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa"."kamerad_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"kamerad_id" integer NOT NULL,
	"jacke_groesse" text,
	"hose_groesse" text,
	"stiefel_groesse" text,
	"handschuh_groesse" text,
	"hemd_groesse" text,
	"poloshirt_groesse" text,
	"fleece_groesse" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kamerad_details_kamerad_id_unique" UNIQUE("kamerad_id")
);
--> statement-breakpoint
CREATE TABLE "psa"."normen" (
	"id" serial PRIMARY KEY NOT NULL,
	"bezeichnung" text,
	"ausruestungstyp_kategorie" text,
	"normbezeichnung" text,
	"url" text,
	"pruefintervall_monate" integer,
	"max_lebensdauer_jahre" integer,
	"max_waeschen" integer,
	"beschreibung" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa"."pruefungen" (
	"id" serial PRIMARY KEY NOT NULL,
	"ausruestungstueck_id" integer,
	"kamerad_id" integer,
	"datum" date,
	"ergebnis" text,
	"pruefer" text,
	"naechste_pruefung" date,
	"notizen" text,
	"foto" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa"."schadensdokumentation" (
	"id" serial PRIMARY KEY NOT NULL,
	"ausruestungstueck_id" integer,
	"datum" date,
	"beschreibung" text,
	"foto" text,
	"erstellt_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa"."waesche" (
	"id" serial PRIMARY KEY NOT NULL,
	"ausruestungstueck_id" integer,
	"kamerad_id" integer,
	"datum" date,
	"notizen" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."kameraden" ADD COLUMN "karten_id" text;--> statement-breakpoint
ALTER TABLE "psa"."ausgaben" ADD CONSTRAINT "ausgaben_ausruestungstueck_id_ausruestungstuecke_id_fk" FOREIGN KEY ("ausruestungstueck_id") REFERENCES "psa"."ausruestungstuecke"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."ausgaben" ADD CONSTRAINT "ausgaben_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."ausruestungstuecke" ADD CONSTRAINT "ausruestungstuecke_ausruestungstyp_id_ausruestungstypen_id_fk" FOREIGN KEY ("ausruestungstyp_id") REFERENCES "psa"."ausruestungstypen"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."ausruestungstuecke" ADD CONSTRAINT "ausruestungstuecke_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."kamerad_details" ADD CONSTRAINT "kamerad_details_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."pruefungen" ADD CONSTRAINT "pruefungen_ausruestungstueck_id_ausruestungstuecke_id_fk" FOREIGN KEY ("ausruestungstueck_id") REFERENCES "psa"."ausruestungstuecke"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."pruefungen" ADD CONSTRAINT "pruefungen_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."schadensdokumentation" ADD CONSTRAINT "schadensdokumentation_ausruestungstueck_id_ausruestungstuecke_id_fk" FOREIGN KEY ("ausruestungstueck_id") REFERENCES "psa"."ausruestungstuecke"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."schadensdokumentation" ADD CONSTRAINT "schadensdokumentation_erstellt_von_kameraden_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "core"."kameraden"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."waesche" ADD CONSTRAINT "waesche_ausruestungstueck_id_ausruestungstuecke_id_fk" FOREIGN KEY ("ausruestungstueck_id") REFERENCES "psa"."ausruestungstuecke"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psa"."waesche" ADD CONSTRAINT "waesche_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_psa_ausgaben_kamerad_id" ON "psa"."ausgaben" USING btree ("kamerad_id");--> statement-breakpoint
CREATE INDEX "idx_psa_ausgaben_tueck_id" ON "psa"."ausgaben" USING btree ("ausruestungstueck_id");--> statement-breakpoint
CREATE INDEX "idx_psa_ausruestungstuecke_kamerad_id" ON "psa"."ausruestungstuecke" USING btree ("kamerad_id");--> statement-breakpoint
CREATE INDEX "idx_psa_ausruestungstuecke_typ_id" ON "psa"."ausruestungstuecke" USING btree ("ausruestungstyp_id");--> statement-breakpoint
CREATE INDEX "idx_psa_pruefungen_kamerad_id" ON "psa"."pruefungen" USING btree ("kamerad_id");--> statement-breakpoint
CREATE INDEX "idx_psa_pruefungen_tueck_id" ON "psa"."pruefungen" USING btree ("ausruestungstueck_id");--> statement-breakpoint
CREATE INDEX "idx_psa_schadensdokumentation_tueck_id" ON "psa"."schadensdokumentation" USING btree ("ausruestungstueck_id");--> statement-breakpoint
CREATE INDEX "idx_psa_waesche_kamerad_id" ON "psa"."waesche" USING btree ("kamerad_id");--> statement-breakpoint
CREATE INDEX "idx_psa_waesche_tueck_id" ON "psa"."waesche" USING btree ("ausruestungstueck_id");