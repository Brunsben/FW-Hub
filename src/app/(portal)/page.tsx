import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { isModulKey, MODUL_LABELS } from "@/lib/module-guard";
import { benutzerVorhanden } from "@/lib/setup-status";
import { sichtbareModule } from "@/components/app-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export const dynamic = "force-dynamic";

// Portal-Startseite.
//  * Noch kein Benutzer angelegt → /setup (Prüfung über authDb).
//  * Ohne Session → /login.
//  * Sonst Kacheln für die Module, für die der Benutzer eine Rolle hat, und für
//    globale Admins die Benutzerverwaltung.
// Hinweis ?kein_zugriff=<modul>: nur bekannte Modulnamen (MODUL_LABELS), kein
// reflektierter Freitext.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kein_zugriff?: string | string[] }>;
}) {
  if (!(await benutzerVorhanden())) redirect("/setup");

  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { kein_zugriff } = await searchParams;
  const modul = isModulKey(kein_zugriff) ? kein_zugriff : null;
  const module = sichtbareModule(user);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      {modul && (
        <div
          role="alert"
          className="w-full rounded-md border border-warning/50 bg-warning/10 p-4 text-sm"
        >
          Kein Zugriff auf das Modul {MODUL_LABELS[modul]}. Bitte an einen
          Administrator wenden.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">Willkommen, {user.kamerad_name}</h1>
        <p className="text-sm text-muted-foreground">
          Konsolidierte Feuerwehr-Verwaltung
        </p>
      </div>

      {module.length === 0 ? (
        <p data-keine-module className="text-sm text-muted-foreground">
          Dir ist noch kein Modul zugewiesen. Bitte an einen Administrator wenden.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {module.map((m) => (
            <Link
              key={m.key}
              href={m.href}
              data-kachel={m.key}
              className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors hover:bg-accent">
                <CardHeader>
                  <CardTitle>{m.label}</CardTitle>
                  <CardDescription>{m.beschreibung}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
