import { expect, test, type Browser, type Page } from "@playwright/test";
import { anmelden, aufraeumen, konto } from "./hilfen";

// Freischaltung des Dienstplans (DEPLOYMENT_TAG.md, C2): Menüpunkt in der
// Kopfzeile, Kachel auf der Startseite, Handy-Menü und Profilzeile für jedes
// Konto; Planung und Verwaltung nur für Planer/Admin.

test.describe.configure({ mode: "serial" });

let admin: { name: string; pin: string };
let mitglied: { name: string; pin: string };

async function sitzung(browser: Browser, k: { name: string; pin: string }, breite = 1280): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: breite, height: 900 } });
  await anmelden(context.request, k);
  return context.newPage();
}

test.beforeAll(async () => {
  admin = await konto("fs-admin", { app: "User", dienst: "Admin" });
  mitglied = await konto("fs-mitglied", { app: "User", dienst: null });
});

test.afterAll(async () => {
  const rest = await aufraeumen();
  expect(rest, "Testdaten vollständig entfernt").toEqual({ p: 0, k: 0 });
});

test("Dienstplan-Admin: Menüpunkt und Kachel, kommt zur Planung", async ({ browser }) => {
  const page = await sitzung(browser, admin);
  await page.goto("/");
  const kachel = page.locator('[data-kachel="dienstplan"]');
  await expect(kachel).toContainText("Dienstplan");
  await expect(kachel).toContainText("Jahresplanung, Termine, Exporte");
  const nav = page.locator("header nav[aria-label=Module]");
  await nav.getByRole("link", { name: "Dienstplan", exact: true }).click();
  await expect(page).toHaveURL(/\/dienstplan$/);
  await page.getByRole("link", { name: "Planung", exact: true }).click();
  await expect(page).toHaveURL(/\/dienstplan\/planung$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const r = await page.goto("/dienstplan/verwaltung");
  expect(r?.status()).toBe(200);
  await expect(page).toHaveURL(/\/dienstplan\/verwaltung$/);
  await page.goto("/profil");
  await expect(page.locator("dt", { hasText: /^Dienstplan$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("Admin");
  await page.context().close();
});

test("Konto ohne Dienstplan-Rolle: Menüpunkt zur Mitgliederansicht, kein Zugriff auf Planung und Verwaltung", async ({ browser }) => {
  const page = await sitzung(browser, mitglied);
  await page.goto("/");
  const kachel = page.locator('[data-kachel="dienstplan"]');
  await expect(kachel).toContainText("Termine, Kalender, Themenvorschläge");
  await page.locator("header nav[aria-label=Module]").getByRole("link", { name: "Dienstplan", exact: true }).click();
  await expect(page).toHaveURL(/\/dienstplan$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dienstplan");
  await expect(page.getByRole("link", { name: "Planung", exact: true })).toHaveCount(0);
  await expect(page.locator('a[href="/dienstplan/verwaltung"], a[href="/dienstplan/planung"]')).toHaveCount(0);
  for (const pfad of ["/dienstplan/planung", "/dienstplan/verwaltung"]) {
    await page.goto(pfad);
    await expect(page).toHaveURL(/\/\?kein_zugriff=dienstplan$/);
    await expect(page.getByRole("alert").filter({ hasText: "Kein Zugriff auf das Modul Dienstplan" })).toBeVisible();
  }
  await page.goto("/profil");
  await expect(page.locator("dt", { hasText: /^Dienstplan$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("Mitglied");
  await page.context().close();
});

test("Handy 390 px: Menü mit Dienstplan, ohne seitliches Scrollen", async ({ browser }) => {
  const page = await sitzung(browser, mitglied, 390);
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const menue = page.getByRole("dialog");
  const eintrag = menue.getByRole("link", { name: "Dienstplan", exact: true });
  await expect(eintrag).toBeVisible();
  const [scroll, breite] = await menue.evaluate((e) => [e.scrollWidth, e.clientWidth]);
  expect(scroll).toBeLessThanOrEqual(breite);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await eintrag.click();
  await expect(page).toHaveURL(/\/dienstplan$/);
  await page.context().close();
});
