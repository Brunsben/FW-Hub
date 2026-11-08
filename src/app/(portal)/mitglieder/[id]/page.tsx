import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth";
import { sichtbareAbschnitte } from "@/lib/mitglieder/abschnitte";
import { ladeMitgliedGecacht } from "@/lib/mitglieder/lesen";
import { kannMitgliederSehen, kannMitgliedSehen } from "@/lib/mitglieder/rechte";
import { ABSCHNITTE } from "@/lib/mitglieder/registry";
import { redirectNoModuleAccess } from "@/lib/module-guard";

export const dynamic = "force-dynamic";

// Eine Person mit allen Abschnitten, die der Benutzer sehen darf. Die Seite
// kennt keinen Abschnitt fest: Sie geht die Registry durch (lib/mitglieder/
// registry.ts) und zeigt, was rechte() freigibt. Wer keine Verwaltungsrolle hat,
// sieht nur die eigene Person und landet dafür besser im Profil.
export default async function MitgliedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  if (id === user.kamerad_id && !kannMitgliederSehen(user)) redirect("/profil");
  if (!kannMitgliedSehen(user, id)) return redirectNoModuleAccess("mitglieder");

  const mitglied = await ladeMitgliedGecacht(user, id);
  if (!mitglied) notFound();

  const abschnitte = sichtbareAbschnitte(ABSCHNITTE, user, id);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="grid gap-3">
        <Link
          href="/mitglieder"
          className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> Alle Mitglieder
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            {mitglied.vorname} {mitglied.name}
          </h1>
          <Badge variant={mitglied.aktiv ? "secondary" : "destructive"}>
            {mitglied.aktiv ? "aktiv" : "inaktiv"}
          </Badge>
          {mitglied.zugang === null && <Badge variant="outline">kein Login</Badge>}
        </div>
        {(mitglied.dienstgrad || mitglied.personalnummer) && (
          <p className="text-sm text-muted-foreground">
            {[mitglied.dienstgrad, mitglied.personalnummer && `Personalnummer ${mitglied.personalnummer}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      {abschnitte.map(({ abschnitt, bearbeiten }) => (
        <Card key={abschnitt.key} id={abschnitt.key} data-abschnitt={abschnitt.key} className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{abschnitt.titel}</CardTitle>
            {abschnitt.beschreibung && <CardDescription>{abschnitt.beschreibung}</CardDescription>}
          </CardHeader>
          <CardContent>
            <abschnitt.Komponente mitgliedId={id} bearbeiten={bearbeiten} user={user} />
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
