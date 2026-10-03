"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface KameradCardRow {
  id: number;
  vorname: string;
  name: string;
  personalnummer: string | null;
  kartenId: string | null;
  aktiv: boolean;
}

export function KameradenCardsManager({
  kameraden,
}: {
  kameraden: KameradCardRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editCard, setEditCard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    updated: number;
    errors: string[];
  } | null>(null);
  const [qrLink, setQrLink] = useState<{ name: string; url: string } | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kameraden;
    return kameraden.filter(
      (k) =>
        `${k.vorname} ${k.name}`.toLowerCase().includes(q) ||
        (k.personalnummer ?? "").toLowerCase().includes(q),
    );
  }, [kameraden, search]);

  async function saveCard(id: number) {
    setError(null);
    const res = await fetch(`/api/food/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: editCard.trim() || null }),
    });
    if (res.ok) {
      setEditId(null);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Speichern fehlgeschlagen");
    }
  }

  async function generateQr(k: KameradCardRow) {
    setError(null);
    const res = await fetch("/api/food/admin/mobile-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kameradId: k.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setQrLink({
        name: `${k.vorname} ${k.name}`,
        url: `${window.location.origin}${data.url}`,
      });
    } else {
      setError(data.error ?? "QR-Token-Erzeugung fehlgeschlagen");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportResult(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/food/admin/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import fehlgeschlagen");
      setImportResult({ updated: data.updated, errors: data.errors ?? [] });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kameraden – Karten-ID-Zuordnung</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="k-search">Suche</Label>
            <Input
              id="k-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name oder Personalnummer"
              className="w-64"
            />
          </div>
          <div className="ml-auto flex items-end gap-3">
            <Button type="button" variant="outline" asChild>
              <a href="/api/food/admin/example-csv">Vorlage herunterladen</a>
            </Button>
            <div className="grid gap-2">
              <Label htmlFor="csv-import">CSV-Import (Karten-IDs)</Label>
              <Input
                id="csv-import"
                type="file"
                accept=".csv,text/csv"
                onChange={handleImport}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {importResult && (
          <div className="rounded-lg border p-3 text-sm">
            <p>{importResult.updated} Karten-ID(s) aktualisiert.</p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-destructive">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {qrLink && (
          <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">QR-Link für {qrLink.name}</p>
            <div className="flex gap-2">
              <Input readOnly value={qrLink.url} className="flex-1" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(qrLink.url)}
              >
                Kopieren
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setQrLink(null)}
              >
                Schließen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              QR-Bild-Darstellung ausstehend (qrcode-Paket nicht installiert).
            </p>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Personalnummer</TableHead>
              <TableHead>Karten-ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Keine Kameraden gefunden.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">
                    {k.vorname} {k.name}
                  </TableCell>
                  <TableCell>{k.personalnummer ?? "—"}</TableCell>
                  <TableCell>
                    {editId === k.id ? (
                      <Input
                        value={editCard}
                        onChange={(e) => setEditCard(e.target.value)}
                        className="w-40"
                      />
                    ) : (
                      (k.kartenId ?? "—")
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={k.aktiv ? "default" : "secondary"}>
                      {k.aktiv ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {editId === k.id ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => saveCard(k.id)}
                          >
                            Speichern
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditId(null)}
                          >
                            Abbrechen
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditId(k.id);
                              setEditCard(k.kartenId ?? "");
                            }}
                          >
                            Karte zuordnen
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => generateQr(k)}
                          >
                            QR-Code
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
