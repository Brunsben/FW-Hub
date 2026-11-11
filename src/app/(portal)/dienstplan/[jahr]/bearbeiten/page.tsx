import { notFound } from "next/navigation";
import { istDienstAdmin } from "@/lib/dienstplan/auth";
import { requireDienstplanSeite } from "@/lib/dienstplan/seiten";
import { Eingabemaske } from "@/components/dienstplan/eingabemaske";

export const dynamic = "force-dynamic";

// Eingabemaske (Spec 7.2), Klickbedienung: Termin anklicken, dann Thema oder
// Block rechts hinzufügen; Thema anklicken, dann Person hinzufügen. Planer und
// Admin. Drag and Drop, Rückgängig und Vorjahresanzeige kommen mit Phase 7.
export default async function BearbeitenPage({ params }: { params: Promise<{ jahr: string }> }) {
  const s = await requireDienstplanSeite("Planer");
  const jahr = Number((await params).jahr);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) notFound();
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Eingabemaske jahr={jahr} istAdmin={istDienstAdmin(s.rolle)} />
    </main>
  );
}
