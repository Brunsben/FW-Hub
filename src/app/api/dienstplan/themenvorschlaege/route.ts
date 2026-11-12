import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeVorschlag } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";
import { ladeAnzeigenamen } from "@/lib/dienstplan/plan";

type Vorschlag = { id: number; titel: string; beschreibung: string | null; vorgeschlagenVon: number; vorgeschlagenAm: string; status: string; themaId: number | null };

// Themenpool (Spec 7.2, 7.4). Lesen: Planer alle, Mitglieder nur die eigenen
// (Policy themenvorschlaege_lesen). ?status=offen|uebernommen|verworfen filtert,
// ?eigene=1 nur die eigenen (auch für Planer). Einreicher als Anzeigename.
export async function GET(req: Request) {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const q = new URL(req.url).searchParams;
    const status = q.get("status");
    if (status && !["offen", "uebernommen", "verworfen"].includes(status)) throw new DpFehler(400, "Unbekannter Status");
    const rows = await tx.execute<Vorschlag>(sql`
      select id, titel, beschreibung, vorgeschlagen_von as "vorgeschlagenVon",
             to_char(vorgeschlagen_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "vorgeschlagenAm",
             status::text as status, thema_id as "themaId"
        from dienstplan.themenvorschlaege
       where organisation_id = ${s.organisationId}
         ${status ? sql`and status = ${status}::dienstplan.vorschlag_status` : sql``}
         ${q.get("eigene") === "1" ? sql`and vorgeschlagen_von = ${s.kameradId}` : sql``}
       order by vorgeschlagen_am desc, id desc`);
    const { namen } = await ladeAnzeigenamen(tx);
    return NextResponse.json({
      vorschlaege: rows.map((v) => ({ ...v, einreicher: namen.get(v.vorgeschlagenVon) ?? "?", eigen: v.vorgeschlagenVon === s.kameradId })),
    });
  });
}

// Vorschlag einreichen (jede angemeldete Person, Spec 6: Annahme "alle
// Mitglieder"). Immer für sich selbst, Status offen (Policy themenvorschlaege_einreichen).
export async function POST(req: Request) {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const e = pruefeVorschlag(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const [r] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.themenvorschlaege (organisation_id, titel, beschreibung, vorgeschlagen_von)
      values (${s.organisationId}, ${e.daten.titel}, ${e.daten.beschreibung}, ${s.kameradId}) returning id`), "Vorschlag");
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
