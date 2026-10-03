import {
  pgSchema,
  serial,
  text,
  boolean,
  integer,
  uuid,
  date,
  timestamp,
  index,
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
  // RFID-Karten-ID — modulübergreifend (FoodBot liest sie); daher in core.
  kartenId: text("karten_id"),
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
}, (t) => ({
  // NULL mehrfach erlaubt → partielle Unique-Indizes nur für Nicht-NULL-Werte.
  kartenIdUnique: uniqueIndex("idx_kameraden_karten_id")
    .on(t.kartenId)
    .where(sql`${t.kartenId} is not null`),
  personalnummerUnique: uniqueIndex("idx_kameraden_personalnummer")
    .on(t.personalnummer)
    .where(sql`${t.personalnummer} is not null`),
}));

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

// ============================================================================
// MODUL PSA-VERWALTUNG — eigenes DB-Schema psa. Alle Personenbezüge
// (kamerad_id) referenzieren core.kameraden.id direkt; das Modul führt KEINE
// eigene Mitgliederliste. Herkunft der Felder: psa-verwaltung/frontend/src/
// types/index.ts + setup/migration-rls-kamerad-id.sql (kamerad_id-Spalten).
//
// Bewusste Modernisierungen gegenüber dem NocoDB/PostgREST-Original
// (vor Migrations-Generierung zu bestätigen):
//  - String-Matching (Ausruestungstyp-Text = Bezeichnung) → echte FKs.
//  - Denormalisierte Anzeige-Textspalten ("Kamerad", "Ausruestungstyp" auf
//    Kind-Tabellen) entfernt; Anzeige erfolgt per Join. Der sync_kamerad_id-
//    Trigger des Originals entfällt damit.
//  - PSA-spezifische Größenfelder in psa.kamerad_details ausgelagert.
//  - created_at/updated_at ergänzt (Konsistenz mit fw_funk).
//  - KartenID (modulübergreifendes FoodBot-RFID-Feld) in core.kameraden.
//  - schadensdokumentation.erstellt_von als FK → core.kameraden statt des
//    Benutzernamen-Textes des Originals (saveSchaden setzte Benutzername).
// ============================================================================
export const psa = pgSchema("psa");

// PSA-spezifische Zusatzdaten pro Kamerad (1:1 zu core.kameraden).
export const psaKameradDetails = psa.table("kamerad_details", {
  id: serial("id").primaryKey(),
  kameradId: integer("kamerad_id")
    .notNull()
    .unique()
    .references(() => kameraden.id, { onDelete: "cascade" }),
  jackeGroesse: text("jacke_groesse"),
  hoseGroesse: text("hose_groesse"),
  stiefelGroesse: text("stiefel_groesse"),
  handschuhGroesse: text("handschuh_groesse"),
  hemdGroesse: text("hemd_groesse"),
  poloshirtGroesse: text("poloshirt_groesse"),
  fleeceGroesse: text("fleece_groesse"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Ausrüstungstypen (Katalog): Prüfintervalle, Lebensdauer, Norm-Verweis.
export const psaAusruestungstypen = psa.table("ausruestungstypen", {
  id: serial("id").primaryKey(),
  bezeichnung: text("bezeichnung").notNull(),
  typ: text("typ"), // Kategorie (z.B. Jacke, Hose, Helm)
  pruefintervallMonate: integer("pruefintervall_monate"),
  maxLebensdauerJahre: integer("max_lebensdauer_jahre"),
  maxWaeschen: integer("max_waeschen"),
  norm: text("norm"),
  foto: text("foto"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Normen-Katalog (Referenzwerte je Ausrüstungstyp-Kategorie).
export const psaNormen = psa.table("normen", {
  id: serial("id").primaryKey(),
  bezeichnung: text("bezeichnung"),
  ausruestungstypKategorie: text("ausruestungstyp_kategorie"),
  normbezeichnung: text("normbezeichnung"),
  url: text("url"),
  pruefintervallMonate: integer("pruefintervall_monate"),
  maxLebensdauerJahre: integer("max_lebensdauer_jahre"),
  maxWaeschen: integer("max_waeschen"),
  beschreibung: text("beschreibung"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Einzelne Ausrüstungsstücke. kamerad_id = aktueller Träger (RLS-relevant).
export const psaAusruestungstuecke = psa.table(
  "ausruestungstuecke",
  {
    id: serial("id").primaryKey(),
    ausruestungstypId: integer("ausruestungstyp_id").references(
      () => psaAusruestungstypen.id,
      { onDelete: "set null" },
    ),
    seriennummer: text("seriennummer"),
    status: text("status"),
    kaufdatum: date("kaufdatum"),
    herstellungsdatum: date("herstellungsdatum"),
    naechstePruefung: date("naechste_pruefung"),
    letztePruefung: date("letzte_pruefung"),
    lebensendeDatum: date("lebensende_datum"),
    qrCode: text("qr_code"),
    waescheAnzahl: integer("waesche_anzahl").notNull().default(0),
    groesse: text("groesse"),
    notizen: text("notizen"),
    kameradId: integer("kamerad_id").references(() => kameraden.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kameradIdx: index("idx_psa_ausruestungstuecke_kamerad_id").on(t.kameradId),
    typIdx: index("idx_psa_ausruestungstuecke_typ_id").on(t.ausruestungstypId),
  }),
);

// Ausgabe-/Rückgabe-Verlauf pro Ausrüstungsstück.
export const psaAusgaben = psa.table(
  "ausgaben",
  {
    id: serial("id").primaryKey(),
    ausruestungstueckId: integer("ausruestungstueck_id").references(
      () => psaAusruestungstuecke.id,
      { onDelete: "cascade" },
    ),
    kameradId: integer("kamerad_id").references(() => kameraden.id, {
      onDelete: "set null",
    }),
    ausgabedatum: date("ausgabedatum"),
    rueckgabedatum: date("rueckgabedatum"),
    notizen: text("notizen"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kameradIdx: index("idx_psa_ausgaben_kamerad_id").on(t.kameradId),
    tueckIdx: index("idx_psa_ausgaben_tueck_id").on(t.ausruestungstueckId),
  }),
);

// Prüfungshistorie pro Ausrüstungsstück.
export const psaPruefungen = psa.table(
  "pruefungen",
  {
    id: serial("id").primaryKey(),
    ausruestungstueckId: integer("ausruestungstueck_id").references(
      () => psaAusruestungstuecke.id,
      { onDelete: "cascade" },
    ),
    kameradId: integer("kamerad_id").references(() => kameraden.id, {
      onDelete: "set null",
    }),
    datum: date("datum"),
    ergebnis: text("ergebnis"),
    pruefer: text("pruefer"),
    naechstePruefung: date("naechste_pruefung"),
    notizen: text("notizen"),
    foto: text("foto"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kameradIdx: index("idx_psa_pruefungen_kamerad_id").on(t.kameradId),
    tueckIdx: index("idx_psa_pruefungen_tueck_id").on(t.ausruestungstueckId),
  }),
);

// Wäsche-Verlauf pro Ausrüstungsstück.
export const psaWaesche = psa.table(
  "waesche",
  {
    id: serial("id").primaryKey(),
    ausruestungstueckId: integer("ausruestungstueck_id").references(
      () => psaAusruestungstuecke.id,
      { onDelete: "cascade" },
    ),
    kameradId: integer("kamerad_id").references(() => kameraden.id, {
      onDelete: "set null",
    }),
    datum: date("datum"),
    waescheart: text("waescheart").notNull().default("Normal"),
    notizen: text("notizen"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kameradIdx: index("idx_psa_waesche_kamerad_id").on(t.kameradId),
    tueckIdx: index("idx_psa_waesche_tueck_id").on(t.ausruestungstueckId),
  }),
);

// Schadensdokumentation pro Ausrüstungsstück.
export const psaSchadensdokumentation = psa.table(
  "schadensdokumentation",
  {
    id: serial("id").primaryKey(),
    ausruestungstueckId: integer("ausruestungstueck_id").references(
      () => psaAusruestungstuecke.id,
      { onDelete: "cascade" },
    ),
    datum: date("datum"),
    beschreibung: text("beschreibung"),
    foto: text("foto"),
    erstelltVon: integer("erstellt_von").references(() => kameraden.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tueckIdx: index("idx_psa_schadensdokumentation_tueck_id").on(
      t.ausruestungstueckId,
    ),
  }),
);

// Audit-/Änderungsprotokoll. Original-RLS: User dürfen nur Einträge mit
// eigenem Benutzernamen einfügen (changelog_insert) — in Phase 2 abzubilden.
export const psaChangelog = psa.table("changelog", {
  id: serial("id").primaryKey(),
  tabelle: text("tabelle"),
  aktion: text("aktion"),
  details: text("details"),
  benutzer: text("benutzer"),
  zeitpunkt: timestamp("zeitpunkt", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const psaKameradDetailsRelations = relations(
  psaKameradDetails,
  ({ one }) => ({
    kamerad: one(kameraden, {
      fields: [psaKameradDetails.kameradId],
      references: [kameraden.id],
    }),
  }),
);

export const psaAusruestungstypenRelations = relations(
  psaAusruestungstypen,
  ({ many }) => ({
    stuecke: many(psaAusruestungstuecke),
  }),
);

export const psaAusruestungstueckeRelations = relations(
  psaAusruestungstuecke,
  ({ one, many }) => ({
    typ: one(psaAusruestungstypen, {
      fields: [psaAusruestungstuecke.ausruestungstypId],
      references: [psaAusruestungstypen.id],
    }),
    ausgaben: many(psaAusgaben),
    pruefungen: many(psaPruefungen),
    waesche: many(psaWaesche),
    schaeden: many(psaSchadensdokumentation),
  }),
);

export const psaSchadensdokumentationRelations = relations(
  psaSchadensdokumentation,
  ({ one }) => ({
    ausruestungstueck: one(psaAusruestungstuecke, {
      fields: [psaSchadensdokumentation.ausruestungstueckId],
      references: [psaAusruestungstuecke.id],
    }),
  }),
);

export const psaAusgabenRelations = relations(psaAusgaben, ({ one }) => ({
  ausruestungstueck: one(psaAusruestungstuecke, {
    fields: [psaAusgaben.ausruestungstueckId],
    references: [psaAusruestungstuecke.id],
  }),
}));

export const psaPruefungenRelations = relations(psaPruefungen, ({ one }) => ({
  ausruestungstueck: one(psaAusruestungstuecke, {
    fields: [psaPruefungen.ausruestungstueckId],
    references: [psaAusruestungstuecke.id],
  }),
}));

export const psaWaescheRelations = relations(psaWaesche, ({ one }) => ({
  ausruestungstueck: one(psaAusruestungstuecke, {
    fields: [psaWaesche.ausruestungstueckId],
    references: [psaAusruestungstuecke.id],
  }),
}));

export type PsaKameradDetails = typeof psaKameradDetails.$inferSelect;
export type PsaAusruestungstyp = typeof psaAusruestungstypen.$inferSelect;
export type PsaAusruestungstueck = typeof psaAusruestungstuecke.$inferSelect;
export type PsaAusgabe = typeof psaAusgaben.$inferSelect;
export type PsaPruefung = typeof psaPruefungen.$inferSelect;
export type PsaWaesche = typeof psaWaesche.$inferSelect;
export type PsaNorm = typeof psaNormen.$inferSelect;
export type PsaSchadensdokumentation =
  typeof psaSchadensdokumentation.$inferSelect;
export type PsaChangelogEntry = typeof psaChangelog.$inferSelect;

// ============================================================================
// MODUL KÜCHE/FOODBOT — eigenes DB-Schema fw_food. Personenbezug (kamerad_id)
// referenziert core.kameraden.id direkt; das Modul führt KEINE eigene
// Mitgliederliste (die alte users-Tabelle entfällt). Herkunft: FoodBot/src/
// lib/db/schema.ts. menus/guests/preset_menus/admin_log unverändert übernommen;
// registrations.user_id → kamerad_id; neue Tabelle mobile_tokens ersetzt die
// users.mobile_token-Spalte.
// ============================================================================
export const fwFood = pgSchema("fw_food");

export const foodMenus = fwFood.table(
  "menus",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull().defaultNow(),
    description: text("description").notNull(),
    zweiMenuesAktiv: boolean("zwei_menues_aktiv").notNull().default(false),
    menu1Name: text("menu1_name"),
    menu2Name: text("menu2_name"),
    registrationDeadline: text("registration_deadline")
      .notNull()
      .default("19:45"),
    deadlineEnabled: boolean("deadline_enabled").notNull().default(true),
  },
  (t) => ({
    dateUnique: uniqueIndex("menus_date_idx").on(t.date),
  }),
);

export const foodRegistrations = fwFood.table(
  "registrations",
  {
    id: serial("id").primaryKey(),
    kameradId: integer("kamerad_id")
      .notNull()
      .references(() => kameraden.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull().defaultNow(),
    menuChoice: integer("menu_choice").notNull().default(1),
  },
  (t) => ({
    kameradDateUnique: uniqueIndex("registrations_kamerad_date_idx").on(
      t.kameradId,
      t.date,
    ),
    dateKameradIdx: index("registrations_date_kamerad_idx").on(
      t.date,
      t.kameradId,
    ),
  }),
);

export const foodGuests = fwFood.table(
  "guests",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull().defaultNow(),
    menuChoice: integer("menu_choice").notNull().default(1),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    dateMenuUnique: uniqueIndex("guests_date_menu_idx").on(t.date, t.menuChoice),
    dateIdx: index("guests_date_idx").on(t.date),
  }),
);

export const foodAdminLog = fwFood.table(
  "admin_log",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    adminUser: text("admin_user").notNull(),
    action: text("action").notNull(),
    details: text("details"),
  },
  (t) => ({
    timestampIdx: index("admin_log_timestamp_idx").on(t.timestamp),
    adminUserIdx: index("admin_log_admin_user_idx").on(t.adminUser),
  }),
);

export const foodPresetMenus = fwFood.table("preset_menus", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Ersetzt die alte users.mobile_token-Spalte: Token für die mobile
// QR-Registrierung, verknüpft mit einem Kameraden.
export const foodMobileTokens = fwFood.table(
  "mobile_tokens",
  {
    id: serial("id").primaryKey(),
    kameradId: integer("kamerad_id")
      .notNull()
      .references(() => kameraden.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // 1 Token pro Kamerad (wie die alte users.mobile_token-Spalte).
    kameradUnique: uniqueIndex("idx_food_mobile_tokens_kamerad_id").on(
      t.kameradId,
    ),
  }),
);

export const foodRegistrationsRelations = relations(
  foodRegistrations,
  ({ one }) => ({
    kamerad: one(kameraden, {
      fields: [foodRegistrations.kameradId],
      references: [kameraden.id],
    }),
  }),
);

export const foodMobileTokensRelations = relations(
  foodMobileTokens,
  ({ one }) => ({
    kamerad: one(kameraden, {
      fields: [foodMobileTokens.kameradId],
      references: [kameraden.id],
    }),
  }),
);

export type FoodMenu = typeof foodMenus.$inferSelect;
export type FoodRegistration = typeof foodRegistrations.$inferSelect;
export type FoodGuest = typeof foodGuests.$inferSelect;
export type FoodAdminLogEntry = typeof foodAdminLog.$inferSelect;
export type FoodPresetMenu = typeof foodPresetMenus.$inferSelect;
export type FoodMobileToken = typeof foodMobileTokens.$inferSelect;
