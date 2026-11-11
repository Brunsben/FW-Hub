import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { dienstplanRoute, leseIdParam } from "@/lib/dienstplan/route";

// Verantwortlichen von einer Themenposition entfernen (Planer und Admin). Die
// übrigen werden lückenlos neu nummeriert.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ tx }) => {
    const [v] = expectRows(await tx.execute<{ ttId: number }>(sql`
      delete from dienstplan.termin_verantwortliche where id = ${leseIdParam((await params).id)}
      returning termin_thema_id as "ttId"`), "Verantwortlicher");
    await tx.execute(sql`
      update dienstplan.termin_verantwortliche v set position = n.neu
        from (select id, row_number() over (order by position, id)::int as neu
                from dienstplan.termin_verantwortliche where termin_thema_id = ${v.ttId}) n
       where v.id = n.id and v.position <> n.neu`);
    return NextResponse.json({ ok: true });
  });
}
