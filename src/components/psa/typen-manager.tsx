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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface TypRow {
  id: number;
  bezeichnung: string;
  typ: string | null;
  pruefintervallMonate: number | null;
  maxLebensdauerJahre: number | null;
  maxWaeschen: number | null;
  norm: string | null;
}

export interface NormOption {
  id: number;
  bezeichnung: string | null;
  ausruestungstypKategorie: string | null;
  beschreibung: string | null;
  pruefintervallMonate: number | null;
  maxLebensdauerJahre: number | null;
  maxWaeschen: number | null;
}

type FormState = {
  id: number | null;
  bezeichnung: string;
  typ: string;
  pruefintervallMonate: string;
  maxLebensdauerJahre: string;
  maxWaeschen: string;
  norm: string;
  normWahl: string;
  normHinweis: string;
};

const EMPTY: FormState = {
  id: null,
  bezeichnung: "",
  typ: "",
  pruefintervallMonate: "",
  maxLebensdauerJahre: "",
  maxWaeschen: "",
  norm: "",
  normWahl: "",
  normHinweis: "",
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

export function TypenManager({
  typen,
  normen,
}: {
  typen: TypRow[];
  normen: NormOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Normen passend zur aktuellen Kategorie (analog normenFuerAktuellenTyp).
  const matchingNormen = useMemo(() => {
    const kat = form?.typ.trim();
    if (!kat) return [];
    return normen.filter(
      (n) => n.bezeichnung && n.ausruestungstypKategorie === kat,
    );
  }, [normen, form?.typ]);

  // Bei Auswahl einer Norm deren Kennwerte übernehmen (manuell überschreibbar).
  function applyNorm(wahl: string) {
    if (!form) return;
    if (wahl === "__frei__") {
      setForm({ ...form, normWahl: wahl, normHinweis: "" });
      return;
    }
    const n = matchingNormen.find((x) => x.bezeichnung === wahl);
    if (!n) {
      setForm({ ...form, normWahl: wahl, normHinweis: "" });
      return;
    }
    setForm({
      ...form,
      normWahl: wahl,
      norm: n.bezeichnung ?? "",
      normHinweis: n.beschreibung ?? "",
      pruefintervallMonate:
        n.pruefintervallMonate != null
          ? String(n.pruefintervallMonate)
          : form.pruefintervallMonate,
      maxLebensdauerJahre:
        n.maxLebensdauerJahre != null
          ? String(n.maxLebensdauerJahre)
          : form.maxLebensdauerJahre,
      maxWaeschen:
        n.maxWaeschen != null ? String(n.maxWaeschen) : form.maxWaeschen,
    });
  }

  function startEdit(t: TypRow) {
    setError(null);
    setForm({
      id: t.id,
      bezeichnung: t.bezeichnung,
      typ: t.typ ?? "",
      pruefintervallMonate: t.pruefintervallMonate?.toString() ?? "",
      maxLebensdauerJahre: t.maxLebensdauerJahre?.toString() ?? "",
      maxWaeschen: t.maxWaeschen?.toString() ?? "",
      norm: t.norm ?? "",
      normWahl: "",
      normHinweis: "",
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
        bezeichnung: form.bezeichnung.trim(),
        typ: orNull(form.typ),
        pruefintervallMonate: num(form.pruefintervallMonate),
        maxLebensdauerJahre: num(form.maxLebensdauerJahre),
        maxWaeschen: num(form.maxWaeschen),
        norm: orNull(form.norm),
      };
      const res = await fetch("/api/psa/ausruestungstypen", {
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

  async function handleDelete(t: TypRow) {
    if (!confirm(`Typ "${t.bezeichnung}" wirklich löschen?`)) return;
    const res = await fetch(`/api/psa/ausruestungstypen?id=${t.id}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ausrüstungstypen</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button type="button" onClick={() => setForm({ ...EMPTY })}>
            Neuer Typ
          </Button>
        </div>

        {form && (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="t-bezeichnung">Bezeichnung</Label>
              <Input
                id="t-bezeichnung"
                value={form.bezeichnung}
                onChange={(e) =>
                  setForm({ ...form, bezeichnung: e.target.value })
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-typ">Kategorie</Label>
              <Input
                id="t-typ"
                value={form.typ}
                onChange={(e) => setForm({ ...form, typ: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-intervall">Prüfintervall (Monate)</Label>
              <Input
                id="t-intervall"
                type="number"
                value={form.pruefintervallMonate}
                onChange={(e) =>
                  setForm({ ...form, pruefintervallMonate: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-lebensdauer">Max. Lebensdauer (Jahre)</Label>
              <Input
                id="t-lebensdauer"
                type="number"
                value={form.maxLebensdauerJahre}
                onChange={(e) =>
                  setForm({ ...form, maxLebensdauerJahre: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-waeschen">Max. Waschzyklen</Label>
              <Input
                id="t-waeschen"
                type="number"
                value={form.maxWaeschen}
                onChange={(e) =>
                  setForm({ ...form, maxWaeschen: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-norm">Norm</Label>
              {matchingNormen.length > 0 ? (
                <>
                  <Select value={form.normWahl} onValueChange={applyNorm}>
                    <SelectTrigger>
                      <SelectValue placeholder="Norm wählen oder Freitext" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__frei__">Freitext…</SelectItem>
                      {matchingNormen.map((n) => (
                        <SelectItem key={n.id} value={n.bezeichnung as string}>
                          {n.bezeichnung}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.normWahl === "__frei__" && (
                    <Input
                      value={form.norm}
                      onChange={(e) =>
                        setForm({ ...form, norm: e.target.value })
                      }
                      placeholder="Norm eingeben…"
                    />
                  )}
                  {form.normHinweis && (
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      {form.normHinweis}
                    </p>
                  )}
                </>
              ) : (
                <Input
                  id="t-norm"
                  value={form.norm}
                  onChange={(e) => setForm({ ...form, norm: e.target.value })}
                  placeholder="z.B. DIN EN 469"
                />
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive sm:col-span-2">{error}</p>
            )}

            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="submit"
                disabled={submitting || !form.bezeichnung.trim()}
              >
                {submitting
                  ? "Speichert…"
                  : form.id
                    ? "Änderungen speichern"
                    : "Typ anlegen"}
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
              <TableHead>Intervall (M)</TableHead>
              <TableHead>Lebensdauer (J)</TableHead>
              <TableHead>Max. Wäschen</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {typen.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Keine Typen erfasst.
                </TableCell>
              </TableRow>
            ) : (
              typen.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.bezeichnung}</TableCell>
                  <TableCell>{t.typ ?? "—"}</TableCell>
                  <TableCell>{t.pruefintervallMonate ?? "—"}</TableCell>
                  <TableCell>{t.maxLebensdauerJahre ?? "—"}</TableCell>
                  <TableCell>{t.maxWaeschen ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(t)}
                      >
                        Bearbeiten
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(t)}
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
