CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "fw_funk";
--> statement-breakpoint
CREATE TABLE "core"."benutzer" (
	"id" serial PRIMARY KEY NOT NULL,
	"benutzername" text NOT NULL,
	"pin" text NOT NULL,
	"rolle" text DEFAULT 'User' NOT NULL,
	"kamerad_id" integer NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benutzer_benutzername_unique" UNIQUE("benutzername")
);
--> statement-breakpoint
CREATE TABLE "fw_funk"."device_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"owner_id" integer,
	"issued_by_id" integer,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	"returned_by_id" integer,
	"reason" text,
	"status" text DEFAULT 'issued' NOT NULL,
	"damage_description" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fw_funk"."device_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"owner_id" integer NOT NULL,
	"assigned_by_id" integer,
	"assignment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_return_date" date,
	"returned_at" timestamp with time zone,
	"returned_by_id" integer,
	"status" text DEFAULT 'assigned' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fw_funk"."devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" text NOT NULL,
	"device_type" text NOT NULL,
	"model" text,
	"manufacturer" text,
	"purchase_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "fw_funk"."pager_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"ric_number" integer NOT NULL,
	"pocsag_frequency" text,
	"programming_stand" text,
	"ric_assignment" text,
	"notes" text,
	"last_programmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fw_funk"."radio_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"issi" text,
	"talkgroup" text,
	"fleetmap" text,
	"programming_stand" text,
	"notes" text,
	"last_programmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fw_funk"."ric_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ric_number" integer NOT NULL,
	"callsign" text,
	"location" text,
	"description" text,
	"active_from" date,
	"active_to" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ric_library_ric_number_unique" UNIQUE("ric_number")
);
--> statement-breakpoint
CREATE TABLE "core"."kameraden" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"vorname" text NOT NULL,
	"dienstgrad" text,
	"email" text,
	"personalnummer" text,
	"aktiv" boolean DEFAULT true NOT NULL,
	"psa_rolle" text,
	"food_rolle" text,
	"fk_rolle" text,
	"funk_rolle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."benutzer" ADD CONSTRAINT "benutzer_kamerad_id_kameraden_id_fk" FOREIGN KEY ("kamerad_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_audit_log" ADD CONSTRAINT "device_audit_log_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "fw_funk"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_audit_log" ADD CONSTRAINT "device_audit_log_owner_id_kameraden_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_audit_log" ADD CONSTRAINT "device_audit_log_issued_by_id_kameraden_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_audit_log" ADD CONSTRAINT "device_audit_log_returned_by_id_kameraden_id_fk" FOREIGN KEY ("returned_by_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_assignments" ADD CONSTRAINT "device_assignments_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "fw_funk"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_assignments" ADD CONSTRAINT "device_assignments_owner_id_kameraden_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_assignments" ADD CONSTRAINT "device_assignments_assigned_by_id_kameraden_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."device_assignments" ADD CONSTRAINT "device_assignments_returned_by_id_kameraden_id_fk" FOREIGN KEY ("returned_by_id") REFERENCES "core"."kameraden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."pager_configs" ADD CONSTRAINT "pager_configs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "fw_funk"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."pager_configs" ADD CONSTRAINT "pager_configs_ric_number_ric_library_ric_number_fk" FOREIGN KEY ("ric_number") REFERENCES "fw_funk"."ric_library"("ric_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fw_funk"."radio_configs" ADD CONSTRAINT "radio_configs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "fw_funk"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_funk_assignment_open_unique" ON "fw_funk"."device_assignments" USING btree ("device_id") WHERE "fw_funk"."device_assignments"."returned_at" IS NULL;