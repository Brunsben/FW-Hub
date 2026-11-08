import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, LockKeyhole, TriangleAlert } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import { isModulKey, MODUL_LABELS } from "@/lib/module-guard";
import { benutzerVorhanden } from "@/lib/setup-status";
import { sichtbareModule } from "@/components/app-header";
import { MODUL_ICONS } from "@/components/modul-icons";

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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      {modul && (
        <div
          role="alert"
          className="flex w-full items-start gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <p>
            Kein Zugriff auf das Modul {MODUL_LABELS[modul]}. Bitte an einen
            Administrator wenden.
          </p>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Willkommen, {user.kamerad_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Konsolidierte Feuerwehr-Verwaltung
        </p>
      </div>

      {module.length === 0 ? (
        <div
          data-keine-module
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center"
        >
          <LockKeyhole className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Dir ist noch kein Modul zugewiesen. Bitte an einen Administrator wenden.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {module.map((m) => {
            const Icon = MODUL_ICONS[m.key];
            return (
              <Link
                key={m.key}
                href={m.href}
                data-kachel={m.key}
                className="group rounded-2xl"
              >
                <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/60 group-hover:shadow-md group-focus-visible:border-primary/60 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    <h2 className="text-base font-semibold">{m.label}</h2>
                    <p className="text-sm text-muted-foreground">{m.beschreibung}</p>
                  </div>
                  <ArrowRight
                    className="size-4 self-end text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                    aria-hidden
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
