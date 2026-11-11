"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ABMELDE_HINWEIS, apiCall, type Meldung } from "./api-client";

type RollenSpalte = "psaRolle" | "foodRolle" | "fkRolle" | "funkRolle" | "dienstRolle";

const SPALTEN: { key: RollenSpalte; label: string }[] = [
  { key: "psaRolle", label: "PSA" },
  { key: "foodRolle", label: "Küche" },
  { key: "fkRolle", label: "Führerschein" },
  { key: "funkRolle", label: "Funk" },
  { key: "dienstRolle", label: "Dienstplan" },
];
const KEINE = "__keine__"; // Radix-Select erlaubt keinen leeren Wert

export function RollenFormular({
  kameradId,
  rollen,
  erlaubt,
}: {
  kameradId: number;
  rollen: Record<RollenSpalte, string | null>;
  erlaubt: Record<RollenSpalte, string[]>;
}) {
  const router = useRouter();
  const [werte, setWerte] = useState<Record<RollenSpalte, string>>({
    psaRolle: rollen.psaRolle ?? KEINE,
    foodRolle: rollen.foodRolle ?? KEINE,
    fkRolle: rollen.fkRolle ?? KEINE,
    funkRolle: rollen.funkRolle ?? KEINE,
    dienstRolle: rollen.dienstRolle ?? KEINE,
  });
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [busy, setBusy] = useState(false);

  const geaendert = SPALTEN.filter((s) => werte[s.key] !== (rollen[s.key] ?? KEINE));

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, string | null> = {};
    for (const s of geaendert) body[s.key] = werte[s.key] === KEINE ? null : werte[s.key];
    setBusy(true);
    const r = await apiCall("PATCH", `/api/admin/rollen/${kameradId}`, body);
    setBusy(false);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: "Rollen gespeichert." });
    router.refresh();
  }

  return (
    <form onSubmit={speichern} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {SPALTEN.map((s) => (
          <div key={s.key} className="grid gap-2">
            <Label htmlFor={`rolle-${s.key}`}>{s.label}</Label>
            <Select value={werte[s.key]} onValueChange={(v) => setWerte({ ...werte, [s.key]: v })}>
              <SelectTrigger id={`rolle-${s.key}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEINE}>– keine –</SelectItem>
                {erlaubt[s.key].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={geaendert.length === 0}>Rollen speichern</Button>
        <span className="text-xs text-muted-foreground">
          {ABMELDE_HINWEIS} Dienstplan ohne Rolle: Mitglied (liest freigegebene Pläne).
        </span>
      </div>
      {meldung && (
        <p role={meldung.ok ? "status" : "alert"} className={meldung.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {meldung.text}
        </p>
      )}
    </form>
  );
}
