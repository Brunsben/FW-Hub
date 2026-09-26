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
import { resizeImageToDataUrl } from "@/lib/psa-foto";

export interface PruefungRow {
  id: number;
  datum: string | null;
  ergebnis: string | null;
  pruefer: string | null;
  naechstePruefung: string | null;
  notizen: string | null;
  foto: string | null;
  stueckLabel: string;
}

export interface WaescheRow {
  id: number;
  datum: string | null;
  waescheart: string | null;
  notizen: string | null;
  stueckLabel: string;
}

export interface SchadenRow {
  id: number;
  datum: string | null;
  beschreibung: string | null;
  foto: string | null;
  stueckLabel: string;
}

export interface PieceOption {
  id: number;
  label: string;
}

type Tab = "pruefungen" | "waesche" | "schaeden";

const heute = () => new Date().toISOString().slice(0, 10);

function fmt(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("de-DE");
}

export function VerlaufBrowser({
  pruefungen,
  waesche,
  schaeden,
  pieces,
  canEdit,
}: {
  pruefungen: PruefungRow[];
  waesche: WaescheRow[];
  schaeden: SchadenRow[];
  pieces: PieceOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pruefungen");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pForm, setPForm] = useState({
    ausruestungstueckId: "",
    datum: heute(),
    ergebnis: "Bestanden",
    pruefer: "",
    naechstePruefung: "",
    notizen: "",
    foto: null as string | null,
  });
  const [wForm, setWForm] = useState({
    ausruestungstueckId: "",
    datum: heute(),
    waescheart: "Normal",
    notizen: "",
  });
  const [sForm, setSForm] = useState({
    ausruestungstueckId: "",
    datum: heute(),
    beschreibung: "",
    foto: null as string | null,
  });

  async function onFoto(
    e: React.ChangeEvent<HTMLInputElement>,
    set: (url: string) => void,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set(await resizeImageToDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Foto-Upload fehlgeschlagen");
    }
  }

  async function submit(url: string, body: unknown, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Speichern fehlgeschlagen");
      }
      after?.();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function savePruefung(e: React.FormEvent) {
    e.preventDefault();
    const stueckId = Number(pForm.ausruestungstueckId);
    if (!stueckId) return;
    const ok = await submit("/api/psa/pruefungen", {
      ausruestungstueckId: stueckId,
      datum: pForm.datum || null,
      ergebnis: pForm.ergebnis || null,
      pruefer: pForm.pruefer.trim() || null,
      naechstePruefung: pForm.naechstePruefung || null,
      notizen: pForm.notizen.trim() || null,
      foto: pForm.foto,
    });
    if (!ok) return;
    // Wie im Original: nächste Prüfung am Stück nachziehen.
    if (pForm.naechstePruefung) {
      await fetch("/api/psa/ausruestungstuecke", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: stueckId,
          naechstePruefung: pForm.naechstePruefung,
        }),
      });
    }
    setPForm({
      ausruestungstueckId: "",
      datum: heute(),
      ergebnis: "Bestanden",
      pruefer: "",
      naechstePruefung: "",
      notizen: "",
      foto: null,
    });
    router.refresh();
  }

  async function saveWaesche(e: React.FormEvent) {
    e.preventDefault();
    const stueckId = Number(wForm.ausruestungstueckId);
    if (!stueckId) return;
    const ok = await submit("/api/psa/waesche", {
      ausruestungstueckId: stueckId,
      datum: wForm.datum || null,
      waescheart: wForm.waescheart.trim() || "Normal",
      notizen: wForm.notizen.trim() || null,
    });
    if (!ok) return;
    setWForm({ ausruestungstueckId: "", datum: heute(), waescheart: "Normal", notizen: "" });
    router.refresh();
  }

  async function saveSchaden(e: React.FormEvent) {
    e.preventDefault();
    const stueckId = Number(sForm.ausruestungstueckId);
    if (!stueckId) return;
    if (!sForm.foto) {
      setError("Foto ist erforderlich");
      return;
    }
    const ok = await submit("/api/psa/schadensdokumentation", {
      ausruestungstueckId: stueckId,
      datum: sForm.datum || null,
      beschreibung: sForm.beschreibung.trim() || null,
      foto: sForm.foto,
    });
    if (!ok) return;
    setSForm({
      ausruestungstueckId: "",
      datum: heute(),
      beschreibung: "",
      foto: null,
    });
    router.refresh();
  }

  const stueckSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Ausrüstungsstück wählen" />
      </SelectTrigger>
      <SelectContent>
        {pieces.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verlauf</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={tab === "pruefungen" ? "default" : "outline"}
            onClick={() => setTab("pruefungen")}
          >
            Prüfungen
          </Button>
          <Button
            type="button"
            variant={tab === "waesche" ? "default" : "outline"}
            onClick={() => setTab("waesche")}
          >
            Wäsche
          </Button>
          <Button
            type="button"
            variant={tab === "schaeden" ? "default" : "outline"}
            onClick={() => setTab("schaeden")}
          >
            Schäden
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* ── Prüfungen ── */}
        {tab === "pruefungen" && (
          <>
            {canEdit && (
              <form
                onSubmit={savePruefung}
                className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
              >
                <div className="grid gap-2">
                  <Label>Ausrüstungsstück</Label>
                  {stueckSelect(pForm.ausruestungstueckId, (v) =>
                    setPForm({ ...pForm, ausruestungstueckId: v }),
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-datum">Datum</Label>
                  <Input
                    id="p-datum"
                    type="date"
                    value={pForm.datum}
                    onChange={(e) =>
                      setPForm({ ...pForm, datum: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-ergebnis">Ergebnis</Label>
                  <Input
                    id="p-ergebnis"
                    value={pForm.ergebnis}
                    onChange={(e) =>
                      setPForm({ ...pForm, ergebnis: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-pruefer">Prüfer</Label>
                  <Input
                    id="p-pruefer"
                    value={pForm.pruefer}
                    onChange={(e) =>
                      setPForm({ ...pForm, pruefer: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-naechste">Nächste Prüfung</Label>
                  <Input
                    id="p-naechste"
                    type="date"
                    value={pForm.naechstePruefung}
                    onChange={(e) =>
                      setPForm({ ...pForm, naechstePruefung: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-notizen">Notizen</Label>
                  <Input
                    id="p-notizen"
                    value={pForm.notizen}
                    onChange={(e) =>
                      setPForm({ ...pForm, notizen: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="p-foto">Foto</Label>
                  <Input
                    id="p-foto"
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      onFoto(e, (url) => setPForm({ ...pForm, foto: url }))
                    }
                  />
                  {pForm.foto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pForm.foto}
                      alt="Vorschau"
                      className="mt-2 h-24 w-auto rounded border"
                    />
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={busy || !pForm.ausruestungstueckId}
                  >
                    {busy ? "Speichert…" : "Prüfung speichern"}
                  </Button>
                </div>
              </form>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Stück</TableHead>
                  <TableHead>Ergebnis</TableHead>
                  <TableHead>Prüfer</TableHead>
                  <TableHead>Nächste Prüfung</TableHead>
                  <TableHead>Foto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pruefungen.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      Keine Prüfungen erfasst.
                    </TableCell>
                  </TableRow>
                ) : (
                  pruefungen.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{fmt(p.datum)}</TableCell>
                      <TableCell>{p.stueckLabel}</TableCell>
                      <TableCell>{p.ergebnis ?? "—"}</TableCell>
                      <TableCell>{p.pruefer ?? "—"}</TableCell>
                      <TableCell>{fmt(p.naechstePruefung)}</TableCell>
                      <TableCell>
                        {p.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.foto}
                            alt="Prüfung"
                            className="h-10 w-auto rounded border"
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}

        {/* ── Wäsche ── */}
        {tab === "waesche" && (
          <>
            {canEdit && (
              <form
                onSubmit={saveWaesche}
                className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
              >
                <div className="grid gap-2">
                  <Label>Ausrüstungsstück</Label>
                  {stueckSelect(wForm.ausruestungstueckId, (v) =>
                    setWForm({ ...wForm, ausruestungstueckId: v }),
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="w-datum">Datum</Label>
                  <Input
                    id="w-datum"
                    type="date"
                    value={wForm.datum}
                    onChange={(e) =>
                      setWForm({ ...wForm, datum: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="w-waescheart">Waschart</Label>
                  <Input
                    id="w-waescheart"
                    value={wForm.waescheart}
                    onChange={(e) =>
                      setWForm({ ...wForm, waescheart: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="w-notizen">Notizen</Label>
                  <Input
                    id="w-notizen"
                    value={wForm.notizen}
                    onChange={(e) =>
                      setWForm({ ...wForm, notizen: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={busy || !wForm.ausruestungstueckId}
                  >
                    {busy ? "Speichert…" : "Wäsche speichern"}
                  </Button>
                </div>
              </form>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Stück</TableHead>
                  <TableHead>Waschart</TableHead>
                  <TableHead>Notizen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waesche.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground"
                    >
                      Keine Wäsche-Einträge erfasst.
                    </TableCell>
                  </TableRow>
                ) : (
                  waesche.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>{fmt(w.datum)}</TableCell>
                      <TableCell>{w.stueckLabel}</TableCell>
                      <TableCell>{w.waescheart ?? "—"}</TableCell>
                      <TableCell>{w.notizen ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}

        {/* ── Schäden ── */}
        {tab === "schaeden" && (
          <>
            {canEdit && (
              <form
                onSubmit={saveSchaden}
                className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
              >
                <div className="grid gap-2">
                  <Label>Ausrüstungsstück</Label>
                  {stueckSelect(sForm.ausruestungstueckId, (v) =>
                    setSForm({ ...sForm, ausruestungstueckId: v }),
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-datum">Datum</Label>
                  <Input
                    id="s-datum"
                    type="date"
                    value={sForm.datum}
                    onChange={(e) =>
                      setSForm({ ...sForm, datum: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="s-beschreibung">Beschreibung</Label>
                  <Input
                    id="s-beschreibung"
                    value={sForm.beschreibung}
                    onChange={(e) =>
                      setSForm({ ...sForm, beschreibung: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="s-foto">Foto (erforderlich)</Label>
                  <Input
                    id="s-foto"
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      onFoto(e, (url) => setSForm({ ...sForm, foto: url }))
                    }
                  />
                  {sForm.foto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sForm.foto}
                      alt="Vorschau"
                      className="mt-2 h-24 w-auto rounded border"
                    />
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={busy || !sForm.ausruestungstueckId || !sForm.foto}
                  >
                    {busy ? "Speichert…" : "Schaden speichern"}
                  </Button>
                </div>
              </form>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Stück</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Foto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schaeden.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground"
                    >
                      Keine Schäden erfasst.
                    </TableCell>
                  </TableRow>
                ) : (
                  schaeden.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{fmt(s.datum)}</TableCell>
                      <TableCell>{s.stueckLabel}</TableCell>
                      <TableCell>{s.beschreibung ?? "—"}</TableCell>
                      <TableCell>
                        {s.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.foto}
                            alt="Schaden"
                            className="h-10 w-auto rounded border"
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
