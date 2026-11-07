import { isModulKey, MODUL_LABELS } from "@/lib/module-guard";

// Übergangs-Startseite bis zur Portal-Shell (Stufe 4). Zeigt einen Hinweis,
// wenn ein Modul wegen fehlender Rolle hierher umgeleitet hat. Nur bekannte
// Modulnamen werden angezeigt, kein reflektierter Freitext.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kein_zugriff?: string | string[] }>;
}) {
  const { kein_zugriff } = await searchParams;
  const modul = isModulKey(kein_zugriff) ? kein_zugriff : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      {modul && (
        <div
          role="alert"
          className="w-full rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
        >
          Kein Zugriff auf das Modul {MODUL_LABELS[modul]}. Bitte an einen
          Administrator wenden.
        </div>
      )}
      <h1 className="text-3xl font-bold">FW-Hub</h1>
      <p className="text-sm opacity-70">
        Konsolidierte Feuerwehr-Verwaltung — PSA, Küche, Führerscheinkontrolle,
        Funktechnik.
      </p>
    </main>
  );
}
