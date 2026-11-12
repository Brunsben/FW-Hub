import { sql } from "drizzle-orm";
import { withDienstplanScope } from "@/lib/db/scoped";
import { istDienstAdmin } from "@/lib/dienstplan/auth";
import { requireDienstplanSeite } from "@/lib/dienstplan/seiten";
import { PlanUebersicht, type PlanZeile } from "@/components/dienstplan/plan-uebersicht";

export const dynamic = "force-dynamic";

// Planung: alle Pläne mit Status und Terminzahl, Links zur Eingabemaske, für den
// Dienstplan-Admin "Neues Jahr anlegen" (Spec 5.2a). Planer und Admin.
export default async function PlanungPage() {
  const s = await requireDienstplanSeite("Planer");
  const plaene = await withDienstplanScope(
    { kameradId: s.kameradId, dienstRolle: s.rolle, organisationId: s.organisationId },
    (tx) => tx.execute<PlanZeile>(sql`
      select p.jahr, p.status::text as status, p.version,
             (select count(*)::int from dienstplan.termine t where t.plan_id = p.id) as termine
        from dienstplan.plaene p where p.organisation_id = ${s.organisationId} order by p.jahr desc`),
  );
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dienstplan – Planung</h1>
        <p className="text-sm text-muted-foreground">Pläne bearbeiten, ein neues Jahr anlegen, Kataloge pflegen.</p>
      </div>
      <PlanUebersicht plaene={[...plaene]} istAdmin={istDienstAdmin(s.rolle)} />
    </main>
  );
}
