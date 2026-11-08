"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// CSV-Import der Karten-IDs (Werkzeug der Küche). Die einzelne Karten-ID und der
// QR-Link einer Person werden unter Mitglieder → Person → Küche gepflegt. Der
// Import ordnet Zeilen über die Personalnummer zu und schreibt nur die
// Karten-ID über core.set_karten_id (POST /api/food/admin/users/import).
export function KartenImport() {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ updated: number; errors: string[] } | null>(null);

  async function importieren(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setFehler(null);
    setErgebnis(null);
    try {
      const csv = await datei.text();
      const res = await fetch("/api/food/admin/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import fehlgeschlagen");
      setErgebnis({ updated: data.updated, errors: data.errors ?? [] });
      router.refresh();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Karten-IDs per CSV importieren</CardTitle>
        <CardDescription>
          Einzelne Karten-IDs und QR-Links pflegt ihr bei der Person: Mitglieder → Person → Küche.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="outline" asChild>
            <a href="/api/food/admin/example-csv">Vorlage herunterladen</a>
          </Button>
          <div className="grid gap-2">
            <Label htmlFor="csv-import">CSV-Import (Karten-IDs)</Label>
            <Input id="csv-import" type="file" accept=".csv,text/csv" onChange={importieren} />
          </div>
          <Button type="button" variant="ghost" asChild>
            <Link href="/mitglieder">Zu den Mitgliedern</Link>
          </Button>
        </div>

        {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}

        {ergebnis && (
          <div role="status" className="rounded-lg border p-3 text-sm">
            <p>{ergebnis.updated} Karten-ID(s) aktualisiert.</p>
            {ergebnis.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-destructive">
                {ergebnis.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
