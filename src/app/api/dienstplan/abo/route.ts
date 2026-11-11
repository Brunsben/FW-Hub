import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { aboPfad, neuesAboToken } from "@/lib/dienstplan/abo";
import { dienstplanRoute } from "@/lib/dienstplan/route";

// iCal-Abo verwalten (Spec 9.4), nur Dienstplan-Admin.
//   GET    aktives Abo (ohne Token): erstellt am/von, zuletzt abgerufen, Abrufe
//   POST   neues Abo; ein bestehendes wird widerrufen. Antwort mit dem Pfad
//          (Token) – nur jetzt sichtbar, gespeichert wird nur der Hash
//   DELETE aktives Abo widerrufen (Kalender bekommen danach 404)
type Abo = { erstelltAm: string; erstelltVon: number; zuletztAbgerufenAm: string | null; abrufe: number };

const AKTIV = sql`select to_char(erstellt_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "erstelltAm",
  erstellt_von as "erstelltVon", to_char(zuletzt_abgerufen_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "zuletztAbgerufenAm", abrufe
  from dienstplan.ical_abos where widerrufen_am is null`;

export async function GET() {
  return dienstplanRoute("Admin", async ({ tx }) => {
    const [a] = await tx.execute<Abo>(AKTIV);
    return NextResponse.json({ abo: a ?? null });
  });
}

export async function POST() {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    await tx.execute(sql`update dienstplan.ical_abos set widerrufen_am = now() where organisation_id = ${s.organisationId} and widerrufen_am is null`);
    const { token, hash } = neuesAboToken();
    expectRows(await tx.execute(sql`
      insert into dienstplan.ical_abos (organisation_id, token_hash, erstellt_von)
      values (${s.organisationId}, ${hash}, ${s.kameradId}) returning id`), "Abo");
    return NextResponse.json({ pfad: aboPfad(token) }, { status: 201 });
  });
}

export async function DELETE() {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const r = await tx.execute(sql`update dienstplan.ical_abos set widerrufen_am = now()
      where organisation_id = ${s.organisationId} and widerrufen_am is null returning id`);
    return NextResponse.json({ widerrufen: r.length });
  });
}
