CREATE SCHEMA "fw_food";
--> statement-breakpoint
CREATE TABLE "fw_food"."admin_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"admin_user" text NOT NULL,
	"action" text NOT NULL,
	"details" text
);
--> statement-breakpoint
CREATE TABLE "fw_food"."guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"menu_choice" integer DEFAULT 1 NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fw_food"."menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"zwei_menues_aktiv" boolean DEFAULT false NOT NULL,
	"menu1_name" text,
	"menu2_name" text,
	"registration_deadline" text DEFAULT '19:45' NOT NULL,
	"deadline_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fw_food"."mobile_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"kamerad_id" integer NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "fw_food"."preset_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "preset_menus_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "fw_food"."registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"kamerad_id" integer NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"menu_choice" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fw_food"."mobile_tokens" ADD CONSTRAINT "mobile_tokens_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_food"."registrations" ADD CONSTRAINT "registrations_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_log_timestamp_idx" ON "fw_food"."admin_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "admin_log_admin_user_idx" ON "fw_food"."admin_log" USING btree ("admin_user");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_date_menu_idx" ON "fw_food"."guests" USING btree ("date","menu_choice");--> statement-breakpoint
CREATE INDEX "guests_date_idx" ON "fw_food"."guests" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "menus_date_idx" ON "fw_food"."menus" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_food_mobile_tokens_kamerad_id" ON "fw_food"."mobile_tokens" USING btree ("kamerad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_kamerad_date_idx" ON "fw_food"."registrations" USING btree ("kamerad_id","date");--> statement-breakpoint
CREATE INDEX "registrations_date_kamerad_idx" ON "fw_food"."registrations" USING btree ("date","kamerad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_kameraden_karten_id" ON "core"."kameraden" USING btree ("karten_id") WHERE "core"."kameraden"."karten_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_kameraden_personalnummer" ON "core"."kameraden" USING btree ("personalnummer") WHERE "core"."kameraden"."personalnummer" is not null;