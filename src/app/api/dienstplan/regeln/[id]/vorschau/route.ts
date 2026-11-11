import { NextResponse } from "next/server";
import { dienstplanRoute, DpFehler, leseIdParam } from "@/lib/dienstplan/route";
import { feiertageNiedersachsen, regelTreffer } from "@/lib/dienstplan/kalender";
import { ladeRegeln } from "@/lib/dienstplan/plan";

// Die nächsten Treffer einer Regel ab heute (Spec 7.5: Vorschau der nächsten 12).
// ?anzahl=12 (1–52), ?ab=JJJJ-MM-TT optional. Planer und Admin.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const q = new URL(req.url).searchParams;
    const anzahl = Number(q.get("anzahl") ?? 12);
    if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 52) throw new DpFehler(400, "anzahl muss 1 bis 52 sein");
    const ab = q.get("ab") ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ab)) throw new DpFehler(400, "ab muss JJJJ-MM-TT sein");
    const regel = (await ladeRegeln(tx, s.organisationId)).find((r) => r.id === id);
    if (!regel) throw new DpFehler(404, "Regel nicht gefunden");
    const treffer = [];
    for (let jahr = Number(ab.slice(0, 4)); treffer.length < anzahl && jahr <= Number(ab.slice(0, 4)) + 5; jahr++) {
      const f = feiertageNiedersachsen(jahr);
      for (const t of regelTreffer({ ...regel, aktiv: true }, jahr)) {
        if (t.datum >= ab && treffer.length < anzahl) treffer.push({ ...t, feiertag: f.get(t.datum) ?? null });
      }
    }
    return NextResponse.json({ regel, treffer });
  });
}
