import type { Config } from "drizzle-kit";

export default {
  schema: ["./src/lib/db/schema.ts", "./src/lib/db/schema-dienstplan.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://nocodb:nocodb@localhost:5432/nocodb",
  },
} satisfies Config;
