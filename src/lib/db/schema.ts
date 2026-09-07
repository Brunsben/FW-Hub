import {
  pgSchema,
  serial,
  text,
  boolean,
  integer,
  uuid,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Kern-Tabellen liegen im Schema "core" (public wird von NocoDB belegt).
export const core = pgSchema("core");

// ============================================================================
// KAMERADEN — Mitglieder-Stammdaten. Kanonische Identität für alle Module;
// jedes Modul referenziert kameraden.id direkt (keine eigenen Mitgliederlisten).
// ============================================================================
export const kameraden = core.table("kameraden", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vorname: text("vorname").notNull(),
  dienstgrad: text("dienstgrad"),
  email: text("email"),
  personalnummer: text("personalnummer"),
  aktiv: boolean("aktiv").notNull().default(true),
  // Pro-Modul-Rollen — von der Login-Route als JWT-Claims ausgestellt.
  psaRolle: text("psa_rolle"),
  foodRolle: text("food_rolle"),
  fkRolle: text("fk_rolle"),
  funkRolle: text("funk_rolle"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// BENUTZER — Login-Accounts. kamerad_id ist NOT NULL: jeder Account (auch
// Admin) ist mit genau einem Kameraden verknüpft (System-Invariante).
// ============================================================================
export const benutzer = core.table("benutzer", {
  id: serial("id").primaryKey(),
  benutzername: text("benutzername").notNull().unique(),
  pin: text("pin").notNull(), // bcrypt-Hash
  rolle: text("rolle").notNull().default("User"),
  kameradId: integer("kamerad_id")
    .notNull()
    .references(() => kameraden.id),
  aktiv: boolean("aktiv").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const kameradenRelations = relations(kameraden, ({ many }) => ({
  benutzer: many(benutzer),
}));

export const benutzerRelations = relations(benutzer, ({ one }) => ({
  kamerad: one(kameraden, {
    fields: [benutzer.kameradId],
    references: [kameraden.id],
  }),
}));

// ============================================================================
// MODUL FUNKTECHNIK — eigenes DB-Schema fw_funk. Alle Personenbezüge
// (owner_id, assigned_by_id, issued_by_id, returned_by_id) referenzieren
// kameraden.id direkt; das Modul führt KEINE eigene Mitgliederliste.
// ============================================================================
export const fwFunk = pgSchema("fw_funk");

export const funkDevices = fwFunk.table("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  serialNumber: text("serial_number").notNull().unique(),
  deviceType: text("device_type", {
    enum: ["sepura", "unication", "oelmann", "other"],
  }).notNull(),
  model: text("model"),
  manufacturer: text("manufacturer"),
  purchaseDate: date("purchase_date"),
  status: text("status", {
    enum: ["active", "inactive", "maintenance", "decommissioned"],
  })
    .notNull()
    .default("active"),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const funkDeviceAssignments = fwFunk.table(
  "device_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => funkDevices.id, { onDelete: "cascade" }),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => kameraden.id),
    assignedById: integer("assigned_by_id").references(() => kameraden.id),
    assignmentDate: timestamp("assignment_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expectedReturnDate: date("expected_return_date"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedById: integer("returned_by_id").references(() => kameraden.id),
    status: text("status", { enum: ["assigned", "returned", "lost"] })
      .notNull()
      .default("assigned"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Nur eine offene Zuweisung pro Gerät (returned_at IS NULL).
    openUnique: uniqueIndex("idx_funk_assignment_open_unique")
      .on(t.deviceId)
      .where(sql`${t.returnedAt} IS NULL`),
  }),
);

export const funkAuditLog = fwFunk.table("device_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => funkDevices.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id").references(() => kameraden.id),
  issuedById: integer("issued_by_id").references(() => kameraden.id),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  returnedById: integer("returned_by_id").references(() => kameraden.id),
  reason: text("reason"),
  status: text("status", {
    enum: ["issued", "returned", "lost", "damaged"],
  })
    .notNull()
    .default("issued"),
  damageDescription: text("damage_description"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const funkRicLibrary = fwFunk.table("ric_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  ricNumber: integer("ric_number").notNull().unique(),
  callsign: text("callsign"),
  location: text("location"),
  description: text("description"),
  activeFrom: date("active_from"),
  activeTo: date("active_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const funkRadioConfigs = fwFunk.table("radio_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => funkDevices.id, { onDelete: "cascade" }),
  issi: text("issi"),
  talkgroup: text("talkgroup"),
  fleetmap: text("fleetmap"),
  programmingStand: text("programming_stand"),
  notes: text("notes"),
  lastProgrammedAt: timestamp("last_programmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const funkPagerConfigs = fwFunk.table("pager_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => funkDevices.id, { onDelete: "cascade" }),
  ricNumber: integer("ric_number")
    .notNull()
    .references(() => funkRicLibrary.ricNumber),
  pocsagFrequency: text("pocsag_frequency"),
  programmingStand: text("programming_stand"),
  ricAssignment: text("ric_assignment"),
  notes: text("notes"),
  lastProgrammedAt: timestamp("last_programmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const funkDevicesRelations = relations(funkDevices, ({ many }) => ({
  assignments: many(funkDeviceAssignments),
  auditLog: many(funkAuditLog),
  radioConfigs: many(funkRadioConfigs),
  pagerConfigs: many(funkPagerConfigs),
}));

export const funkDeviceAssignmentsRelations = relations(
  funkDeviceAssignments,
  ({ one }) => ({
    device: one(funkDevices, {
      fields: [funkDeviceAssignments.deviceId],
      references: [funkDevices.id],
    }),
  }),
);

export type FunkDevice = typeof funkDevices.$inferSelect;
export type FunkDeviceAssignment = typeof funkDeviceAssignments.$inferSelect;
