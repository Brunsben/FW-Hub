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
import { PSA_STATUS, statusVariant } from "@/lib/psa-status";

export interface PieceRow {
  id: number;
  seriennummer: string | null;
  status: string | null;
  ausruestungstypId: number | null;
  typName: string | null;
  kameradId: number | null;
  kameradName: string | null;
  naechstePruefung: string | null;
}

export interface TypOption {
  id: number;
  bezeichnung: string;
}

export interface KameradOption {
  id: number;
  label: string;
}

const ALLE = "__alle__";

function fmt(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("de-DE");
}

export function AusruestungManager({
  pieces,
  typen,
  kameraden,
  canEdit,
}: {
  pieces: PieceRow[];
  typen: TypOption[];
  kameraden: KameradOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [filterTyp, setFilterTyp] = useState<string>(ALLE);
  const [filterStatus, setFilterStatus] = useState<string>(ALLE);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ausgabe-Panel
  const [issuePiece, setIssuePiece] = useState<PieceRow | null>(null);
  const [issueKamerad, setIssueKamerad] = useState<string>("");

  // Anlegen-Formular
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    ausruestungstypId: "",
    seriennummer: "",
    status: "Lager",
    groesse: "",
    kaufdatum: "",
    herstellungsdatum: "",
    naechstePruefung: "",
    notizen: "",
  });
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return pieces.filter((p) => {
      if (filterTyp !== ALLE && String(p.ausruestungstypId) !== filterTyp)
        return false;
      if (filterStatus !== ALLE && p.status !== filterStatus) return false;
      return true;
    });
  }, [pieces, filterTyp, filterStatus]);

  async function confirmIssue() {
    if (!issuePiece || !issueKamerad) return;
    setError(null);
    setBusyId(issuePiece.id);
    try {
      const res = await fetch("/api/psa/ausgaben", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ausruestungstueckId: issuePiece.id,
          kameradId: Number(issueKamerad),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Ausgabe fehlgeschlagen");
      }
      setIssuePiece(null);
      setIssueKamerad("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReturn(piece: PieceRow) {
    setError(null);
    setBusyId(piece.id);
    try {
      // Offene Ausgabe des Stücks ermitteln, dann zurückgeben.
      const listRes = await fetch(
        `/api/psa/ausgaben?ausruestungstueckId=${piece.id}`,
      );
      if (!listRes.ok) throw new Error("Ausgaben konnten nicht geladen werden");
      const { ausgaben } = await listRes.json();
      const offen = (ausgaben as { id: number; rueckgabedatum: string | null }[])
        .find((a) => !a.rueckgabedatum);
      if (!offen) throw new Error("Keine offene Ausgabe gefunden");

      const res = await fetch("/api/psa/ausgaben", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: offen.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Rückgabe fehlgeschlagen");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/psa/ausruestungstuecke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ausruestungstypId: createForm.ausruestungstypId
            ? Number(createForm.ausruestungstypId)
            : null,
          seriennummer: createForm.seriennummer.trim() || null,
          status: createForm.status,
          groesse: createForm.groesse.trim() || null,
          kaufdatum: createForm.kaufdatum || null,
          herstellungsdatum: createForm.herstellungsdatum || null,
          naechstePruefung: createForm.naechstePruefung || null,
          notizen: createForm.notizen.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Anlegen fehlgeschlagen");
      }
      setShowCreate(false);
      setCreateForm({
        ausruestungstypId: "",
        seriennummer: "",
        status: "Lager",
        groesse: "",
        kaufdatum: "",
        herstellungsdatum: "",
        naechstePruefung: "",
        notizen: "",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ausrüstung</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label>Typ</Label>
            <Select value={filterTyp} onValueChange={setFilterTyp}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle Typen</SelectItem>
                {typen.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.bezeichnung}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle Status</SelectItem>
                {PSA_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canEdit && (
            <div className="ml-auto">
              <Button type="button" onClick={() => setShowCreate((v) => !v)}>
                {showCreate ? "Formular schließen" : "Neues Stück"}
              </Button>
            </div>
          )}
        </div>

        {canEdit && showCreate && (
          <form
            onSubmit={handleCreate}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label>Typ</Label>
              <Select
                value={createForm.ausruestungstypId}
                onValueChange={(v) =>
                  setCreateForm({ ...createForm, ausruestungstypId: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Typ wählen" />
                </SelectTrigger>
                <SelectContent>
                  {typen.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.bezeichnung}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-seriennummer">Seriennummer</Label>
              <Input
                id="c-seriennummer"
                value={createForm.seriennummer}
                onChange={(e) =>
                  setCreateForm({ ...createForm, seriennummer: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={createForm.status}
                onValueChange={(v) =>
                  setCreateForm({ ...createForm, status: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PSA_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-groesse">Größe</Label>
              <Input
                id="c-groesse"
                value={createForm.groesse}
                onChange={(e) =>
                  setCreateForm({ ...createForm, groesse: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-kaufdatum">Kaufdatum</Label>
              <Input
                id="c-kaufdatum"
                type="date"
                value={createForm.kaufdatum}
                onChange={(e) =>
                  setCreateForm({ ...createForm, kaufdatum: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-herstellungsdatum">Herstellungsdatum</Label>
              <Input
                id="c-herstellungsdatum"
                type="date"
                value={createForm.herstellungsdatum}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    herstellungsdatum: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-naechstePruefung">Nächste Prüfung</Label>
              <Input
                id="c-naechstePruefung"
                type="date"
                value={createForm.naechstePruefung}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    naechstePruefung: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-notizen">Notizen</Label>
              <Input
                id="c-notizen"
                value={createForm.notizen}
                onChange={(e) =>
                  setCreateForm({ ...createForm, notizen: e.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating ? "Wird angelegt…" : "Stück anlegen"}
              </Button>
            </div>
          </form>
        )}

        {canEdit && issuePiece && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
            <div className="grid gap-2">
              <Label>
                Ausgabe: {issuePiece.typName ?? "?"} (
                {issuePiece.seriennummer ?? "—"})
              </Label>
              <Select value={issueKamerad} onValueChange={setIssueKamerad}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Kamerad wählen" />
                </SelectTrigger>
                <SelectContent>
                  {kameraden.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={confirmIssue}
              disabled={!issueKamerad || busyId === issuePiece.id}
            >
              Ausgeben
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIssuePiece(null);
                setIssueKamerad("");
              }}
            >
              Abbrechen
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seriennummer</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Kamerad</TableHead>
              <TableHead>Nächste Prüfung</TableHead>
              {canEdit && <TableHead className="text-right">Aktionen</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="text-center text-muted-foreground"
                >
                  Keine Ausrüstungsstücke gefunden.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.seriennummer ?? "—"}
                  </TableCell>
                  <TableCell>{p.typName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(p.status)}>
                      {p.status ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.kameradName ?? "—"}</TableCell>
                  <TableCell>{fmt(p.naechstePruefung)}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {p.status === "Ausgegeben" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleReturn(p)}
                            disabled={busyId === p.id}
                          >
                            Rückgabe
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setIssuePiece(p);
                              setIssueKamerad("");
                            }}
                            disabled={busyId === p.id}
                          >
                            Ausgeben
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
