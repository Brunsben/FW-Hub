import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefePlanStatus } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseJahrParam } from "@/lib/dienstplan/route";
import { ladePlan, planEtag, planOder404, speichereVersion } from "@/lib/dienstplan/plan";

type Ctx = { params: Promise<{ jahr: string }> };

// Ganzer Plan eines Jahres: Termine mit Themen, Verantwortlichen (Anzeigenamen),
// Feiertagen und Hinweisen. ETag = Version + Status; bei If-None-Match mit
// gleichem Wert 304 ohne Inhalt (Grundlage für das Polling der Live-Ansicht).
// Mitglieder sehen nur freigegebene Pläne (sonst 404).
export async function GET(req: Request, { params }: Ctx) {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const etag = planEtag(plan);
    const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return NextResponse.json(await ladePlan(tx, plan, s.organisationId), { headers });
  });
}

// Status setzen (nur Dienstplan-Admin; zusätzlich Trigger plaene_schutz).
//   { status: "freigegeben", bezeichnung? } setzt freigegeben_am/-_von und legt
//     in derselben Transaktion eine Version (Anlass freigabe) an (Spec 8),
//   { status: "entwurf" } nimmt die Freigabe zurück (Mitglieder sehen den Plan dann nicht mehr).
export async function PATCH(req: Request, { params }: Ctx) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const e = pruefePlanStatus(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    if (e.daten.status === plan.status) throw new DpFehler(409, `Plan ist bereits ${plan.status === "freigegeben" ? "freigegeben" : "Entwurf"}`);
    const freigabe = e.daten.status === "freigegeben";
    expectRows(await tx.execute(sql`
      update dienstplan.plaene
         set status = ${e.daten.status}::dienstplan.plan_status,
             freigegeben_am = ${freigabe ? sql`now()` : sql`null`},
             freigegeben_von = ${freigabe ? s.kameradId : null}
       where id = ${plan.id} returning id`), "Plan");
    const version = freigabe ? await speichereVersion(tx, plan, s.kameradId, "freigabe", e.daten.bezeichnung) : null;
    const neu = await planOder404(tx, s.organisationId, plan.jahr);
    return NextResponse.json({ plan: neu, version: version?.nummer ?? null });
  });
}

// Plan löschen (nur Dienstplan-Admin, nur Entwurf). Termine, Themen und
// Verantwortliche hängen per ON DELETE CASCADE daran.
export async function DELETE(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    if (plan.status !== "entwurf") throw new DpFehler(409, "Nur Entwürfe können gelöscht werden. Erst auf Entwurf zurücksetzen.");
    expectRows(await tx.execute(sql`delete from dienstplan.plaene where id = ${plan.id} returning id`), "Plan");
    return NextResponse.json({ ok: true });
  });
}
