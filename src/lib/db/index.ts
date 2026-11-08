import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Dev: Hot-Reload wertet dieses Modul bei jeder Änderung neu aus. Ohne Cache
// entstünde dabei jedes Mal ein neuer Verbindungspool, die alten blieben offen
// und erschöpfen irgendwann max_connections. Deshalb liegt der Client in
// globalThis. In Produktion wird das Modul nur einmal geladen: dort kein Cache.
// Gecacht wird der Client, nicht die drizzle-Instanz (das Schema darf sich im
// Dev-Betrieb ändern).
const globalForDb = globalThis as unknown as {
  __fwDbClient?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(
    process.env.DATABASE_URL ||
      "postgresql://nocodb:nocodb@localhost:5432/nocodb",
    { max: 10 },
  );
}

const client =
  process.env.NODE_ENV === "production"
    ? createClient()
    : (globalForDb.__fwDbClient ??= createClient());

export const db = drizzle(client, { schema });
