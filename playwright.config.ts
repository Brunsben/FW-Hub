import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// E2E-Tests (Playwright) für die Klickliste aus dem Release-Bericht Dienstplan.
// Aufruf: npm run test:e2e
// - Ohne E2E_BASE startet Playwright selbst den Dev-Server (npx next dev
//   --webpack -p 3100) bzw. nutzt einen schon laufenden auf 3100.
// - Mit E2E_BASE (z. B. http://127.0.0.1:3104 für den Standalone-Build) wird
//   kein Server gestartet.
// - Browser: installierter Google Chrome (E2E_CHANNEL=chrome, Standard). Ohne
//   Chrome: E2E_CHANNEL=chromium und einmal `npx playwright install chromium`.
// Datenbank und Server müssen lokal sein (Schutz in e2e/hilfen.ts).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const base = process.env.E2E_BASE ?? "http://localhost:3100";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: base,
    channel: process.env.E2E_CHANNEL === "chromium" ? undefined : (process.env.E2E_CHANNEL ?? "chrome"),
    acceptDownloads: true,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE ? undefined : {
    command: "npx next dev --webpack -p 3100",
    url: `${base}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
