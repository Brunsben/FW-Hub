import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaChangelog } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function PsaChangelogPage() {
  const session = await requirePsaSession();
  if (!session) redirect("/login");
  if (!session.canEdit) redirect("/psa");

  const eintraege = await db
    .select()
    .from(psaChangelog)
    .orderBy(desc(psaChangelog.zeitpunkt))
    .limit(200);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Changelog</h1>
      <Card>
        <CardHeader>
          <CardTitle>Letzte Änderungen</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeitpunkt</TableHead>
                <TableHead>Tabelle</TableHead>
                <TableHead>Aktion</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Benutzer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eintraege.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    Noch keine Einträge.
                  </TableCell>
                </TableRow>
              ) : (
                eintraege.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      {new Date(e.zeitpunkt).toLocaleString("de-DE")}
                    </TableCell>
                    <TableCell>{e.tabelle ?? "—"}</TableCell>
                    <TableCell>{e.aktion ?? "—"}</TableCell>
                    <TableCell>{e.details ?? "—"}</TableCell>
                    <TableCell>{e.benutzer ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
