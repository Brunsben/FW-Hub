import { istDienstPlaner } from "@/lib/dienstplan/auth";
import { requireDienstplanSeite } from "@/lib/dienstplan/seiten";
import { Mitgliederansicht } from "@/components/dienstplan/mitgliederansicht";

export const dynamic = "force-dynamic";

// Mitgliederansicht (Spec 7.4). Jede angemeldete Person; Mitglieder sehen nur
// freigegebene Pläne (RLS). In Kopfzeile, Handy-Menü und Kacheln für alle (C2).
export default async function DienstplanPage() {
  const s = await requireDienstplanSeite("Mitglied");
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Mitgliederansicht istPlaner={istDienstPlaner(s.rolle)} />
    </main>
  );
}
