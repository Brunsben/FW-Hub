import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Separater Login-Client: verbindet als fw_auth (BYPASSRLS) und darf
// ausschließlich core.benutzer lesen. Nur für den Benutzer-Lookup beim Login,
// bevor ein RLS-Scope bekannt ist. Fällt auf DATABASE_URL zurück, solange
// AUTH_DATABASE_URL nicht gesetzt ist (z.B. lokale Entwicklung).
const client = postgres(
  process.env.AUTH_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://nocodb:nocodb@localhost:5432/nocodb",
  { max: 5 },
);

export const authDb = drizzle(client, { schema });
