import ExcelJS from "exceljs";
import type { ExportTermin } from "@/lib/dienstplan/export";
import { datumDe, druckfarbe, toenung, wochentagVon } from "@/lib/dienstplan/druckfarben";

// Excel-Export (Spec 9.1): Blatt je Halbjahr plus Gesamtblatt. Spalten Datum |
// Wochentag | Kürzel | Uhrzeit | Thema | Verantwortlich. Zeile in heller
// Kategorietönung (20 %), Kürzelzelle in voller Kategoriefarbe, Schrift dunkel.
// A4 hoch, an Seitenbreite angepasst, Kopfzeile wiederholt, Legende unter der
// Tabelle, Fußzeile mit Stand und Seitenzahl.

export type ExcelKategorie = { kuerzel: string; name: string; farbe: string };

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const DUNKEL = "FF1C1C1E";

function blatt(wb: ExcelJS.Workbook, name: string, titel: string, termine: ExportTermin[], kategorien: ExcelKategorie[], stand: string) {
  const ws = wb.addWorksheet(name, {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${stand}&RSeite &P von &N` },
    views: [{ state: "frozen", ySplit: 3 }],
  });
  ws.columns = [
    { key: "datum", width: 12 }, { key: "tag", width: 5 }, { key: "kuerzel", width: 7 },
    { key: "zeit", width: 8 }, { key: "thema", width: 52 }, { key: "verantwortlich", width: 34 },
  ];
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = titel;
  ws.getCell("A1").font = { size: 16, bold: true, color: { argb: DUNKEL } };
  ws.getRow(1).height = 24;
  ws.getRow(3).values = ["Datum", "Wochentag", "Kürzel", "Uhrzeit", "Thema", "Verantwortlich"];
  ws.getRow(3).font = { bold: true, color: { argb: DUNKEL } };
  ws.getRow(3).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E5EA" } };
    c.border = { bottom: { style: "thin", color: { argb: "FF8E8E93" } } };
  });
  ws.pageSetup.printTitlesRow = "3:3";
  const kat = new Map(kategorien.map((k) => [k.kuerzel, k]));
  for (const t of termine) {
    const k = kat.get(t.kategorieKuerzel);
    const farbe = druckfarbe(t.ausgefallen ? "gray" : k?.farbe);
    const zeile = ws.addRow({
      datum: datumDe(t.startDatum), tag: wochentagVon(t.startDatum), kuerzel: t.kategorieKuerzel,
      zeit: t.startZeit ?? "", thema: t.ausgefallen ? `entfällt${t.bemerkung ? `: ${t.bemerkung}` : ""}` : t.titel + (t.bemerkung ? ` (${t.bemerkung})` : ""),
      verantwortlich: t.ausgefallen ? "" : t.verantwortliche,
    });
    zeile.alignment = { vertical: "top", wrapText: true };
    zeile.font = { color: { argb: DUNKEL }, strike: t.ausgefallen };
    zeile.eachCell({ includeEmpty: true }, (c, nr) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(nr === 3 ? farbe : toenung(farbe, 0.2)) } };
      c.border = { bottom: { style: "hair", color: { argb: "FFC7C7CC" } } };
    });
    zeile.getCell(3).font = { bold: true, color: { argb: DUNKEL } };
    zeile.getCell(3).alignment = { horizontal: "center", vertical: "top" };
  }
  ws.addRow([]);
  const legende = ws.addRow(["Legende"]);
  legende.font = { bold: true, color: { argb: DUNKEL } };
  for (const k of kategorien) {
    const r = ws.addRow(["", "", k.kuerzel, "", k.name]);
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(druckfarbe(k.farbe)) } };
    r.getCell(3).font = { bold: true, color: { argb: DUNKEL } };
    r.getCell(3).alignment = { horizontal: "center" };
  }
  ws.addRow([]);
  ws.addRow([stand]).font = { italic: true, color: { argb: "FF636366" } };
}

export async function dienstplanExcel(jahr: number, termine: ExportTermin[], kategorien: ExcelKategorie[], stand: string, entwurf: boolean): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FW-Hub";
  wb.created = new Date();
  const zusatz = entwurf ? " (Entwurf)" : "";
  const h1 = termine.filter((t) => Number(t.startDatum.slice(5, 7)) <= 6);
  const h2 = termine.filter((t) => Number(t.startDatum.slice(5, 7)) > 6);
  blatt(wb, "1. Halbjahr", `Dienstplan ${jahr} – 1. Halbjahr${zusatz}`, h1, kategorien, stand);
  blatt(wb, "2. Halbjahr", `Dienstplan ${jahr} – 2. Halbjahr${zusatz}`, h2, kategorien, stand);
  blatt(wb, "Gesamt", `Dienstplan ${jahr}${zusatz}`, termine, kategorien, stand);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
