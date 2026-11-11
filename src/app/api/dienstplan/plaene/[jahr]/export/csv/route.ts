import { NextResponse } from "next/server";
import { aenderungsExport, csvZeilen, feldWert, imHalbjahr, kodiere } from "@/lib/dienstplan/export";
import {
  dateiAntwort, ladeExportTermine, ladeProfil, leseHalbjahr, leseModus, letzterLauf, protokolliere,
} from "@/lib/dienstplan/export-db";
import { planOder404 } from "@/lib/dienstplan/plan";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam, leseJahrParam } from "@/lib/dienstplan/route";

type Ctx = { params: Promise<{ jahr: string }> };

// CSV-Export nach Exportprofil (Spec 9.5), Planer und Admin.
//   POST { profilId, modus: "komplett" | "aenderungen", halbjahr?: 1 | 2 }
// Ausgefallene Termine werden nicht exportiert. "Nur Änderungen" vergleicht mit
// dem letzten Lauf dieses Profils für diesen Plan (Prüfsumme der exportierten
// Felder); ohne früheren Lauf wie "komplett". Die Antwort enthält die Datei
// (Base64) und die Liste "Im Zielsystem löschen" (geänderte und entfallene
// Alttermine). Jeder Lauf wird in export_laeufe protokolliert.
export async function POST(req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const body = await leseBody(req);
    const profil = await ladeProfil(tx, s.organisationId, leseIdParam(String(body.profilId ?? "")));
    const modus = leseModus(body.modus);
    const halbjahr = leseHalbjahr(body.halbjahr);
    if (profil.nurFreigegeben && plan.status !== "freigegeben") {
      throw new DpFehler(409, `Das Profil „${profil.name}“ exportiert nur freigegebene Pläne; ${plan.jahr} ist noch Entwurf.`);
    }
    const termine = (await ladeExportTermine(tx, plan, s.organisationId))
      .filter((t) => !t.ausgefallen && imHalbjahr(t.startDatum, halbjahr))
      .filter((t) => !profil.kategorien || profil.kategorien.includes(t.kategorieKuerzel));
    const vorher = await letzterLauf(tx, plan.id, "csv", profil.id);
    const zeile = (t: (typeof termine)[number]) => profil.spalten.map((sp) => feldWert(t, sp)).join("\u0001");
    const e = aenderungsExport(termine, zeile, vorher?.stand ?? null, modus, (d) => imHalbjahr(d, halbjahr));
    const wirksam = modus === "aenderungen" && vorher ? "aenderungen" : "komplett";
    await protokolliere(tx, plan.id, "csv", profil.id, wirksam, e.stand, s.kameradId);
    const text = csvZeilen(e.exportieren, profil);
    const name = profil.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const heute = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dateiname = `dienstplan-${plan.jahr}${halbjahr ? `-h${halbjahr}` : ""}-${name}${wirksam === "aenderungen" ? "-aenderungen" : ""}-${heute}.csv`;
    const mime = `text/csv; charset=${profil.kodierung === "windows-1252" ? "windows-1252" : "utf-8"}`;
    return NextResponse.json(dateiAntwort(dateiname, mime, kodiere(text, profil.kodierung), {
      anzahl: e.exportieren.length, loeschen: e.loeschen, modus: wirksam, vorherigerLauf: vorher?.erstelltAm ?? null,
    }));
  });
}
