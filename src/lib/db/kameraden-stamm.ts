import { boolean, text } from "drizzle-orm/pg-core";
import { core } from "./schema";

// Teilsicht auf core.kameraden NUR mit den Stammdatenspalten, die fw_app
// anlegen darf (Spaltenrechte, Migrationen 0013 und 0016). Drizzle nennt beim INSERT ALLE
// Spalten der verwendeten Tabellendefinition (nicht angegebene als DEFAULT);
// mit der vollen Definition scheiterte jeder INSERT an id, karten_id und den
// Rollenspalten ("permission denied").
//
// Bewusst NICHT in schema.ts: drizzle-kit würde die zweite Definition derselben
// Tabelle als Schemaänderung lesen. Nur zum Anlegen verwenden, Lesen und UPDATE
// laufen über `kameraden`. Rollen schreibt core.set_kamerad_rollen, die
// Karten-ID core.set_karten_id.
export const kameradenStammdaten = core.table("kameraden", {
  name: text("name").notNull(),
  vorname: text("vorname").notNull(),
  dienstgrad: text("dienstgrad"),
  email: text("email"),
  personalnummer: text("personalnummer"),
  spitzname: text("spitzname"),
  spitznameAnzeigen: boolean("spitzname_anzeigen").notNull().default(false),
  aktiv: boolean("aktiv").notNull().default(true),
});
