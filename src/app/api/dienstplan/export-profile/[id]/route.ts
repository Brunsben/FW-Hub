import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pgErrorCode } from "@/lib/db/pg-error";
import { pruefeProfil } from "@/lib/dienstplan/export";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";

type Ctx = { params: Promise<{ id: string }> };

// Exportprofil ändern (vollständig, wie beim Anlegen) oder löschen. Nur
// Dienstplan-Admin. Ein Profil mit Exportläufen lässt sich nicht löschen (der
// Stand für "nur Änderungen" hängt daran), nur ändern.
export async function PATCH(req: Request, { params }: Ctx) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeProfil(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const d = e.daten;
    expectRows(await tx.execute(sql`
      update dienstplan.export_profile
         set name = ${d.name}, trennzeichen = ${d.trennzeichen}, kodierung = ${d.kodierung}, kopfzeile = ${d.kopfzeile},
             spalten = ${JSON.stringify(d.spalten)}::jsonb, nur_freigegeben = ${d.nurFreigegeben},
             kategorien = ${d.kategorien ? sql`${`{${d.kategorien.join(",")}}`}::text[]` : sql`null`}
       where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Exportprofil");
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    try {
      await tx.execute(sql`savepoint profil_loeschen`);
      expectRows(await tx.execute(sql`delete from dienstplan.export_profile where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Exportprofil");
    } catch (e) {
      if (pgErrorCode(e) === "23503") {
        await tx.execute(sql`rollback to savepoint profil_loeschen`);
        throw new DpFehler(409, "Mit diesem Profil wurde schon exportiert; es kann nur geändert werden.");
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  });
}
