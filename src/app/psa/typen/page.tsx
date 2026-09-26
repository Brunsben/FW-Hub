import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaAusruestungstypen } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { TypenManager, type TypRow } from "@/components/psa/typen-manager";

export default async function PsaTypenPage() {
  const session = await requirePsaSession();
  if (!session) redirect("/login");
  if (!session.canEdit) redirect("/psa");

  const typen: TypRow[] = await db
    .select({
      id: psaAusruestungstypen.id,
      bezeichnung: psaAusruestungstypen.bezeichnung,
      typ: psaAusruestungstypen.typ,
      pruefintervallMonate: psaAusruestungstypen.pruefintervallMonate,
      maxLebensdauerJahre: psaAusruestungstypen.maxLebensdauerJahre,
      maxWaeschen: psaAusruestungstypen.maxWaeschen,
      norm: psaAusruestungstypen.norm,
    })
    .from(psaAusruestungstypen)
    .orderBy(asc(psaAusruestungstypen.bezeichnung));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Typen-Verwaltung</h1>
      <TypenManager typen={typen} />
    </main>
  );
}
