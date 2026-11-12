import { notFound } from "next/navigation";
import { istDienstAdmin } from "@/lib/dienstplan/auth";
import { requireDienstplanSeite } from "@/lib/dienstplan/seiten";
import { Versionen } from "@/components/dienstplan/versionen";

export const dynamic = "force-dynamic";

// Versionsverlauf eines Plans (Spec 8, Phase 9): Planer und Admin;
// Wiederherstellen nur Admin (in der API durchgesetzt).
export default async function VersionenPage({ params }: { params: Promise<{ jahr: string }> }) {
  const s = await requireDienstplanSeite("Planer");
  const jahr = Number((await params).jahr);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) notFound();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Versionen jahr={jahr} istAdmin={istDienstAdmin(s.rolle)} />
    </main>
  );
}
