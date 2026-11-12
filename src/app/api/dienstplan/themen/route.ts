import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeThema } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";

// Themenkatalog. Lesen: jede angemeldete Person (Policy themen_lesen). Dazu je
// Thema "zuletzt" = letztes Datum bis heute, an dem es in einem nicht
// ausgefallenen Termin stand (Spec 7.2, "zuletzt am …"). Die Abfrage läuft unter
// RLS: Mitglieder zählen nur freigegebene Pläne.
export async function GET() {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const themen = await tx.execute(sql`
      select th.id, th.titel, th.kurztitel, th.bereich_id as "bereichId", th.notizen,
             th.pflicht_jaehrlich as "pflichtJaehrlich", th.zielgruppe, th.aktiv,
             (select max(t.datum)::text from dienstplan.termin_themen tt join dienstplan.termine t on t.id = tt.termin_id
               where tt.thema_id = th.id and not t.ausgefallen and t.datum <= current_date) as zuletzt
        from dienstplan.themen th where th.organisation_id = ${s.organisationId}
       order by lower(th.titel)`);
    return NextResponse.json({ themen: [...themen] });
  });
}

// Thema anlegen (Planer und Admin). Titel je Organisation eindeutig (sonst 409).
export async function POST(req: Request) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const e = pruefeThema(await leseBody(req), "neu");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const t = e.daten;
    const [doppelt] = await tx.execute(sql`select 1 from dienstplan.themen where organisation_id = ${s.organisationId} and lower(titel) = lower(${t.titel!})`);
    if (doppelt) throw new DpFehler(409, "Ein Thema mit diesem Titel gibt es schon");
    const [r] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.themen (organisation_id, titel, kurztitel, bereich_id, notizen, pflicht_jaehrlich, zielgruppe, aktiv)
      values (${s.organisationId}, ${t.titel}, ${t.kurztitel ?? null}, ${t.bereichId ?? null}, ${t.notizen ?? null},
              ${t.pflichtJaehrlich ?? false}, ${t.zielgruppe ?? null}, ${t.aktiv ?? true})
      returning id`), "Thema");
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
