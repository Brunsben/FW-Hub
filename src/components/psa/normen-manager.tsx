"use client";

import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface NormRow {
  id: number;
  bezeichnung: string | null;
  ausruestungstypKategorie: string | null;
  normbezeichnung: string | null;
  url: string | null;
  pruefintervallMonate: number | null;
  maxLebensdauerJahre: number | null;
  maxWaeschen: number | null;
  beschreibung: string | null;
}

type FormState = {
  id: number | null;
  bezeichnung: string;
  ausruestungstypKategorie: string;
  normbezeichnung: string;
  url: string;
  pruefintervallMonate: string;
  maxLebensdauerJahre: string;
  maxWaeschen: string;
  beschreibung: string;
};

const EMPTY: FormState = {
  id: null,
  bezeichnung: "",
  ausruestungstypKategorie: "",
  normbezeichnung: "",
  url: "",
  pruefintervallMonate: "",
  maxLebensdauerJahre: "",
  maxWaeschen: "",
  beschreibung: "",
};

function num(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function orNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

export function NormenManager({ normen }: { normen: NormRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(n: NormRow) {
    setError(null);
    setForm({
      id: n.id,
      bezeichnung: n.bezeichnung ?? "",
      ausruestungstypKategorie: n.ausruestungstypKategorie ?? "",
      normbezeichnung: n.normbezeichnung ?? "",
      url: n.url ?? "",
      pruefintervallMonate: n.pruefintervallMonate?.toString() ?? "",
      maxLebensdauerJahre: n.maxLebensdauerJahre?.toString() ?? "",
      maxWaeschen: n.maxWaeschen?.toString() ?? "",
      beschreibung: n.beschreibung ?? "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        bezeichnung: orNull(form.bezeichnung),
        ausruestungstypKategorie: orNull(form.ausruestungstypKategorie),
        normbezeichnung: orNull(form.normbezeichnung),
        url: orNull(form.url),
        pruefintervallMonate: num(form.pruefintervallMonate),
        maxLebensdauerJahre: num(form.maxLebensdauerJahre),
        maxWaeschen: num(form.maxWaeschen),
        beschreibung: orNull(form.beschreibung),
      };
      const res = await fetch("/api/psa/normen", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Speichern fehlgeschlagen");
      }
      setForm(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(n: NormRow) {
    if (!confirm(`Norm "${n.bezeichnung ?? n.normbezeichnung ?? ""}" wirklich löschen?`))
      return;
    const res = await fetch(`/api/psa/normen?id=${n.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Normen</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button type="button" onClick={() => setForm({ ...EMPTY })}>
            Neue Norm
          </Button>
        </div>

        {form && (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="n-bezeichnung">Bezeichnung</Label>
              <Input
                id="n-bezeichnung"
                value={form.bezeichnung}
                onChange={(e) =>
                  setForm({ ...form, bezeichnung: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-kategorie">Ausrüstungstyp-Kategorie</Label>
              <Input
                id="n-kategorie"
                value={form.ausruestungstypKategorie}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ausruestungstypKategorie: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-normbezeichnung">Normbezeichnung</Label>
              <Input
                id="n-normbezeichnung"
                value={form.normbezeichnung}
                onChange={(e) =>
                  setForm({ ...form, normbezeichnung: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-url">URL</Label>
              <Input
                id="n-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-intervall">Prüfintervall (Monate)</Label>
              <Input
                id="n-intervall"
                type="number"
                value={form.pruefintervallMonate}
                onChange={(e) =>
                  setForm({ ...form, pruefintervallMonate: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-lebensdauer">Max. Lebensdauer (Jahre)</Label>
              <Input
                id="n-lebensdauer"
                type="number"
                value={form.maxLebensdauerJahre}
                onChange={(e) =>
                  setForm({ ...form, maxLebensdauerJahre: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-waeschen">Max. Waschzyklen</Label>
              <Input
                id="n-waeschen"
                type="number"
                value={form.maxWaeschen}
                onChange={(e) =>
                  setForm({ ...form, maxWaeschen: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="n-beschreibung">Beschreibung</Label>
              <Input
                id="n-beschreibung"
                value={form.beschreibung}
                onChange={(e) =>
                  setForm({ ...form, beschreibung: e.target.value })
                }
              />
            </div>

            {error && (
              <p className="text-sm text-destructive sm:col-span-2">{error}</p>
            )}

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Speichert…"
                  : form.id
                    ? "Änderungen speichern"
                    : "Norm anlegen"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(null)}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bezeichnung</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Norm</TableHead>
              <TableHead>Intervall (M)</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {normen.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Keine Normen erfasst.
                </TableCell>
              </TableRow>
            ) : (
              normen.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">
                    {n.bezeichnung ?? "—"}
                  </TableCell>
                  <TableCell>{n.ausruestungstypKategorie ?? "—"}</TableCell>
                  <TableCell>{n.normbezeichnung ?? "—"}</TableCell>
                  <TableCell>{n.pruefintervallMonate ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(n)}
                      >
                        Bearbeiten
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(n)}
                      >
                        Löschen
                      </Button>
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
