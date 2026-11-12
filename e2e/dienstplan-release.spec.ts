import { readFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Download, type Page } from "@playwright/test";
import { anmelden, anwesenheitsliste, aufraeumen, ids, JAHR, owner, pngGroesse, STEMPEL, testkonto, testplan } from "./hilfen";

// Klickliste aus dem Release-Bericht Dienstplan (11.11.2026) als E2E-Ablauf.
// Ein Testkonto, ein Testplan (2076), Schritte bauen aufeinander auf (seriell).
// Am Ende wird der Testplan über die API gelöscht; aufgeräumt wird nur, was der
// Test angelegt hat.

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let termine: number[] = [];

const inhalt = async (d: Download) => readFile((await d.path())!);
async function laden(knopf: ReturnType<Page["getByRole"]>) {
  const [d] = await Promise.all([page.waitForEvent("download"), knopf.click()]);
  return d;
}

test.beforeAll(async ({ browser }) => {
  const konto = await testkonto();
  ({ termine } = await testplan(konto.kameradId));
  context = await browser.newContext();
  await anmelden(context.request, konto);
  page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
});

test.afterAll(async () => {
  await context?.close();
  const rest = await aufraeumen();
  expect(rest, "Testdaten vollständig entfernt").toEqual({ p: 0, k: 0 });
});

test("CSV-Import: Vorschau mit Windows-1252 und Umlauten, Übernahme", async () => {
  await page.goto("/mitglieder");
  await page.getByRole("button", { name: "CSV importieren" }).click();
  await page.locator("#import-datei").setInputFiles({ name: "anwesenheitsliste.csv", mimeType: "text/csv", buffer: anwesenheitsliste() });
  const zusammenfassung = page.getByTestId("import-zusammenfassung");
  await expect(zusammenfassung).toContainText("Anwesenheitsliste · 3 Personen: 2 neu, 0 ergänzen, 1 prüfen");
  await expect(page.getByRole("cell", { name: `${STEMPEL}Müller` })).toBeVisible();
  await expect(page.getByRole("cell", { name: "René", exact: true })).toBeVisible();
  await expect(page.locator("tr[data-status=neu] input[type=checkbox]")).toHaveCount(2);
  for (const c of await page.locator("tr[data-status=neu] input[type=checkbox]").all()) await expect(c).toBeChecked();
  await expect(page.locator("tr[data-status=pruefen] input[type=checkbox]")).not.toBeChecked();
  await expect(page.locator("tr[data-status=pruefen]")).toContainText("Sieht nicht nach einer Person aus");
  await page.getByRole("button", { name: "2 Zeile(n) übernehmen" }).click();
  await expect(page.getByRole("status")).toContainText("2 Kamerad(en) angelegt, 0 ergänzt");
  const angelegt = await owner<{ vorname: string }[]>`select vorname from core.kameraden where name like ${STEMPEL + "%"} and name <> ${STEMPEL + "-admin"} order by name`;
  expect(angelegt.map((k) => k.vorname)).toEqual(["Jörg", "René"]);
});

test("Freigabe in der Eingabemaske", async () => {
  await page.goto(`/dienstplan/${JAHR}/bearbeiten`);
  await expect(page.locator("article[data-termin]")).toHaveCount(3);
  await page.getByRole("button", { name: "Freigeben", exact: true }).click();
  await expect(page.getByText("Plan freigegeben, Version gespeichert")).toBeVisible();
  await expect(page.getByText("Freigegeben", { exact: true })).toBeVisible();
});

test("CSV-Export DIVERA: erster Lauf komplett", async () => {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator("#ex-profil").selectOption({ label: "DIVERA 24/7" });
  await page.locator("#ex-modus").selectOption("aenderungen");
  const d = await laden(page.getByRole("button", { name: "CSV erzeugen" }));
  expect(d.suggestedFilename()).toMatch(new RegExp(`^dienstplan-${JAHR}-divera-24-7-\\d{8}\\.csv$`));
  const b = await inhalt(d);
  expect([...b.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const zeilen = b.subarray(3).toString("utf8").trim().split("\r\n");
  expect(zeilen[0]).toBe("Datum;Von;Bis;Titel;Text;Ort");
  expect(zeilen).toHaveLength(4);
  expect(zeilen[2]).toContain(`11.02.${JAHR};19:30;21:30;Dienstabend: Atemschutz – Übung;`);
  await page.keyboard.press("Escape");
});

test("Termin nach Freigabe ändern: \"geändert am\"", async () => {
  const r = await page.request.patch(`/api/dienstplan/termine/${termine[0]}`, { data: { datum: `${JAHR}-01-21` } });
  expect(r.status()).toBe(200);
  await page.reload();
  const karte = page.locator(`article[data-termin="${termine[0]}"]`);
  await expect(karte.locator("[data-geaendert]")).toContainText("geändert am");
  await expect(page.locator("[data-geaendert]")).toHaveCount(1);
});

test("CSV-Export DIVERA: nur Änderungen mit Löschliste", async () => {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator("#ex-profil").selectOption({ label: "DIVERA 24/7" });
  await page.locator("#ex-modus").selectOption("aenderungen");
  const d = await laden(page.getByRole("button", { name: "CSV erzeugen" }));
  expect(d.suggestedFilename()).toContain("-aenderungen-");
  const zeilen = (await inhalt(d)).subarray(3).toString("utf8").trim().split("\r\n");
  expect(zeilen).toHaveLength(2);
  expect(zeilen[1]).toContain(`21.01.${JAHR};19:30;21:30;Dienstabend: Pumpenkunde`);
  const liste = page.getByTestId("loeschliste");
  await expect(liste).toContainText("In DIVERA 24/7 von Hand löschen (1)");
  await expect(liste).toContainText("14.01. 19:30 – Pumpenkunde");
});

test(".ics- und Excel-Download", async () => {
  const ics = await laden(page.getByRole("button", { name: ".ics erzeugen" }));
  expect(ics.suggestedFilename()).toMatch(/\.ics$/);
  const text = (await inhalt(ics)).toString("utf8");
  expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(text).toContain(`UID:dienstplan-${termine[0]}@ofwietmarschen.org`);
  expect(text).toContain(`DTSTART;TZID=Europe/Berlin:${JAHR}0121T193000`);
  const xlsx = await laden(page.getByRole("button", { name: /Excel erzeugen/ }));
  expect(xlsx.suggestedFilename()).toMatch(new RegExp(`^dienstplan-${JAHR}-\\d{8}\\.xlsx$`));
  const b = await inhalt(xlsx);
  expect(b.subarray(0, 2).toString()).toBe("PK");
  expect(b.length).toBeGreaterThan(5000);
  await page.keyboard.press("Escape");
});

test("PDF liefert 200 und application/pdf, Handybild 1290 × 2796", async () => {
  const pdf = await page.request.get(`/api/dienstplan/plaene/${JAHR}/export/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  for (const thema of ["hell", "dunkel"]) {
    const bild = await page.request.get(`/api/dienstplan/plaene/${JAHR}/export/bild?halbjahr=1&thema=${thema}&namen=1`);
    expect(bild.status()).toBe(200);
    expect(bild.headers()["content-type"]).toBe("image/png");
    expect(pngGroesse(await bild.body())).toEqual([1290, 2796]);
  }
});

test("Versionen: speichern, vergleichen, wiederherstellen", async () => {
  await page.goto(`/dienstplan/${JAHR}/versionen`);
  await expect(page.locator("tr[data-version]")).toHaveCount(1);
  await expect(page.getByTestId("vergleich")).toContainText("Version 1 → aktueller Stand: 1 verschoben");
  await page.locator("#v-bezeichnung").fill("E2E Stand");
  await page.getByRole("button", { name: "Version speichern" }).click();
  await expect(page.locator("tr[data-version]")).toHaveCount(2);
  await expect(page.locator('tr[data-version="2"]')).toContainText("E2E Stand");
  await page.locator("#v-von").selectOption("1");
  await page.locator("#v-bis").selectOption("2");
  await page.getByRole("button", { name: "Vergleichen", exact: true }).click();
  await expect(page.getByTestId("vergleich")).toContainText("Version 1 → Version 2: 1 verschoben");
  await expect(page.getByTestId("vergleich")).toContainText("Datum 14.01. → 21.01.");
  await page.locator('tr[data-version="1"]').getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(page.getByRole("status")).toContainText("Version 1 wiederhergestellt (vorheriger Stand als Version 3 gesichert): 1 geändert, 0 angelegt, 0 gelöscht.");
  await expect(page.getByTestId("vergleich")).toContainText("Version 1 → aktueller Stand: keine Änderungen");
  await expect(page.getByText("Entwurf", { exact: true })).toBeVisible();
  const [t] = await owner<{ d: string }[]>`select datum::text d from dienstplan.termine where id = ${termine[0]}`;
  expect(t.d).toBe(`${JAHR}-01-14`);
});

test("/dienstplan bei 390 px Breite ohne horizontales Scrollen", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dienstplan");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dienstplan");
  await expect(page.getByRole("button", { name: "Kalender (.ics)" })).toBeVisible();
  const [breite, fenster] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(breite).toBeLessThanOrEqual(fenster);
});

test("Testplan wieder löschen", async () => {
  const r = await page.request.delete(`/api/dienstplan/plaene/${JAHR}`);
  expect(r.status()).toBe(200);
  const [{ n }] = await owner<{ n: number }[]>`select count(*)::int n from dienstplan.plaene where organisation_id = 1 and jahr = ${JAHR}`;
  expect(n).toBe(0);
  ids.plaene.length = 0;
});
