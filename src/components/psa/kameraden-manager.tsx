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

export interface KameradRow {
  id: number;
  vorname: string;
  name: string;
  dienstgrad: string | null;
  email: string | null;
  personalnummer: string | null;
  kartenId: string | null;
  aktiv: boolean;
  jackeGroesse: string | null;
  hoseGroesse: string | null;
  stiefelGroesse: string | null;
  handschuhGroesse: string | null;
  hemdGroesse: string | null;
  poloshirtGroesse: string | null;
  fleeceGroesse: string | null;
}

const SIZE_FIELDS = [
  ["jackeGroesse", "Jacke"],
  ["hoseGroesse", "Hose"],
  ["stiefelGroesse", "Stiefel"],
  ["handschuhGroesse", "Handschuh"],
  ["hemdGroesse", "Hemd"],
  ["poloshirtGroesse", "Poloshirt"],
  ["fleeceGroesse", "Fleece"],
] as const;

type FormState = {
  id: number | null;
  vorname: string;
  name: string;
  dienstgrad: string;
  email: string;
  personalnummer: string;
  kartenId: string;
  aktiv: boolean;
  jackeGroesse: string;
  hoseGroesse: string;
  stiefelGroesse: string;
  handschuhGroesse: string;
  hemdGroesse: string;
  poloshirtGroesse: string;
  fleeceGroesse: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  vorname: "",
  name: "",
  dienstgrad: "",
  email: "",
  personalnummer: "",
  kartenId: "",
  aktiv: true,
  jackeGroesse: "",
  hoseGroesse: "",
  stiefelGroesse: "",
  handschuhGroesse: "",
  hemdGroesse: "",
  poloshirtGroesse: "",
  fleeceGroesse: "",
};

function orNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

export function KameradenManager({ kameraden }: { kameraden: KameradRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [nurAktiv, setNurAktiv] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kameraden.filter((k) => {
      if (nurAktiv && !k.aktiv) return false;
      if (!q) return true;
      return `${k.vorname} ${k.name}`.toLowerCase().includes(q);
    });
  }, [kameraden, search, nurAktiv]);

  function startNew() {
    setError(null);
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(k: KameradRow) {
    setError(null);
    setForm({
      id: k.id,
      vorname: k.vorname,
      name: k.name,
      dienstgrad: k.dienstgrad ?? "",
      email: k.email ?? "",
      personalnummer: k.personalnummer ?? "",
      kartenId: k.kartenId ?? "",
      aktiv: k.aktiv,
      jackeGroesse: k.jackeGroesse ?? "",
      hoseGroesse: k.hoseGroesse ?? "",
      stiefelGroesse: k.stiefelGroesse ?? "",
      handschuhGroesse: k.handschuhGroesse ?? "",
      hemdGroesse: k.hemdGroesse ?? "",
      poloshirtGroesse: k.poloshirtGroesse ?? "",
      fleeceGroesse: k.fleeceGroesse ?? "",
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
        vorname: form.vorname.trim(),
        name: form.name.trim(),
        dienstgrad: orNull(form.dienstgrad),
        email: orNull(form.email),
        personalnummer: orNull(form.personalnummer),
        kartenId: orNull(form.kartenId),
        aktiv: form.aktiv,
        jackeGroesse: orNull(form.jackeGroesse),
        hoseGroesse: orNull(form.hoseGroesse),
        stiefelGroesse: orNull(form.stiefelGroesse),
        handschuhGroesse: orNull(form.handschuhGroesse),
        hemdGroesse: orNull(form.hemdGroesse),
        poloshirtGroesse: orNull(form.poloshirtGroesse),
        fleeceGroesse: orNull(form.fleeceGroesse),
      };
      const res = await fetch("/api/psa/kameraden", {
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

  async function handleDeactivate(k: KameradRow) {
    if (
      !confirm(`${k.vorname} ${k.name} wirklich deaktivieren (Soft-Delete)?`)
    )
      return;
    const res = await fetch(`/api/psa/kameraden?id=${k.id}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kameraden-Verwaltung</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="k-search">Suche</Label>
            <Input
              id="k-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name oder Vorname"
              className="w-64"
            />
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={nurAktiv}
              onChange={(e) => setNurAktiv(e.target.checked)}
            />
            Nur Aktive
          </label>
          <div className="ml-auto">
            <Button type="button" onClick={startNew}>
              Neuer Kamerad
            </Button>
          </div>
        </div>

        {form && (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-lg border p-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="f-vorname">Vorname</Label>
                <Input
                  id="f-vorname"
                  value={form.vorname}
                  onChange={(e) =>
                    setForm({ ...form, vorname: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-name">Name</Label>
                <Input
                  id="f-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-dienstgrad">Dienstgrad</Label>
                <Input
                  id="f-dienstgrad"
                  value={form.dienstgrad}
                  onChange={(e) =>
                    setForm({ ...form, dienstgrad: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-email">E-Mail</Label>
                <Input
                  id="f-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-personalnummer">Personalnummer</Label>
                <Input
                  id="f-personalnummer"
                  value={form.personalnummer}
                  onChange={(e) =>
                    setForm({ ...form, personalnummer: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-kartenId">Karten-ID</Label>
                <Input
                  id="f-kartenId"
                  value={form.kartenId}
                  onChange={(e) =>
                    setForm({ ...form, kartenId: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Größen</p>
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {SIZE_FIELDS.map(([field, label]) => (
                  <div key={field} className="grid gap-2">
                    <Label htmlFor={`f-${field}`}>{label}</Label>
                    <Input
                      id={`f-${field}`}
                      value={form[field]}
                      onChange={(e) =>
                        setForm({ ...form, [field]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
              Aktiv
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  submitting || !form.vorname.trim() || !form.name.trim()
                }
              >
                {submitting
                  ? "Speichert…"
                  : form.id
                    ? "Änderungen speichern"
                    : "Kamerad anlegen"}
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
              <TableHead>Name</TableHead>
              <TableHead>Dienstgrad</TableHead>
              <TableHead>Personalnummer</TableHead>
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
                  <TableCell>{k.dienstgrad ?? "—"}</TableCell>
                  <TableCell>{k.personalnummer ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={k.aktiv ? "default" : "secondary"}>
                      {k.aktiv ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(k)}
                      >
                        Bearbeiten
                      </Button>
                      {k.aktiv && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeactivate(k)}
                        >
                          Deaktivieren
                        </Button>
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
