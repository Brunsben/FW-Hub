import { istDienstAdmin } from "@/lib/dienstplan/auth";
import { requireDienstplanSeite } from "@/lib/dienstplan/seiten";
import { Verwaltung } from "@/components/dienstplan/verwaltung";

export const dynamic = "force-dynamic";

// Verwaltung des Dienstplans (Spec 7.5): Kategorien und Rhythmusregeln (ändern nur
// Dienstplan-Admin), Themen, Bereiche, Blöcke, externe Personen (Planer und Admin).
export default async function VerwaltungPage() {
  const s = await requireDienstplanSeite("Planer");
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dienstplan – Verwaltung</h1>
        <p className="text-sm text-muted-foreground"><a href="/dienstplan/planung">Zurück zur Planung</a></p>
      </div>
      <Verwaltung istAdmin={istDienstAdmin(s.rolle)} />
    </main>
  );
}
