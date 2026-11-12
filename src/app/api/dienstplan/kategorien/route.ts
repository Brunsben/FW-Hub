import { NextResponse } from "next/server";
import { asc, sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeKategorie } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";
import { withDienstplanScope } from "@/lib/db/scoped";
import { dpKategorien } from "@/lib/db/schema-dienstplan";
import { requireDienstplanSession } from "@/lib/dienstplan/auth";

// Kategorien der eigenen Organisation (D, Z, G, …). Lesen darf jede angemeldete
// Person (Rolle Mitglied genügt); welche Zeilen sichtbar sind, entscheidet RLS
// (kategorien_lesen). Ändern kommt mit der Verwaltung (nur Dienstplan-Admin).
export async function GET() {
  const s = await requireDienstplanSession();
  if (!s) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const kategorien = await withDienstplanScope(
    { kameradId: s.kameradId, dienstRolle: s.rolle, organisationId: s.organisationId },
    (tx) =>
      tx
        .select({
          id: dpKategorien.id,
          kuerzel: dpKategorien.kuerzel,
          name: dpKategorien.name,
          farbe: dpKategorien.farbe,
          standardUhrzeit: dpKategorien.standardUhrzeit,
          standardDauerMinuten: dpKategorien.standardDauerMinuten,
          sortierung: dpKategorien.sortierung,
          aktiv: dpKategorien.aktiv,
        })
        .from(dpKategorien)
        .orderBy(asc(dpKategorien.sortierung), asc(dpKategorien.kuerzel)),
  );
  return NextResponse.json({ kategorien });
}

// Kategorie anlegen (nur Dienstplan-Admin, Policy kategorien_schreiben).
// Body: { kuerzel, name, farbe, standardUhrzeit?, standardDauerMinuten?, sortierung?, aktiv? }
// Kürzel je Organisation eindeutig (409). Gelöscht wird nicht, stattdessen aktiv = false.
export async function POST(req: Request) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const e = pruefeKategorie(await leseBody(req), "neu");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const k = e.daten;
    const [r] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.kategorien (organisation_id, kuerzel, name, farbe, standard_uhrzeit, standard_dauer_minuten, sortierung, aktiv)
      values (${s.organisationId}, ${k.kuerzel}, ${k.name}, ${k.farbe}, ${k.standardUhrzeit ?? null},
              ${k.standardDauerMinuten ?? 120}, ${k.sortierung ?? 0}, ${k.aktiv ?? true})
      returning id`), "Kategorie");
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
