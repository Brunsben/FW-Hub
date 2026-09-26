import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaNormen } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { NormenManager, type NormRow } from "@/components/psa/normen-manager";

export default async function PsaNormenPage() {
  const session = await requirePsaSession();
  if (!session) redirect("/login");
  if (!session.canEdit) redirect("/psa");

  const normen: NormRow[] = await db
    .select({
      id: psaNormen.id,
      bezeichnung: psaNormen.bezeichnung,
      ausruestungstypKategorie: psaNormen.ausruestungstypKategorie,
      normbezeichnung: psaNormen.normbezeichnung,
      url: psaNormen.url,
      pruefintervallMonate: psaNormen.pruefintervallMonate,
      maxLebensdauerJahre: psaNormen.maxLebensdauerJahre,
      maxWaeschen: psaNormen.maxWaeschen,
      beschreibung: psaNormen.beschreibung,
    })
    .from(psaNormen)
    .orderBy(
      asc(psaNormen.ausruestungstypKategorie),
      asc(psaNormen.bezeichnung),
    );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Normen-Verwaltung</h1>
      <NormenManager normen={normen} />
    </main>
  );
}
