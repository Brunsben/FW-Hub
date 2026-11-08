"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiCall, type Meldung } from "@/components/mitglieder/api-client";
import { GROESSEN_FELDER, type Groessen } from "@/lib/psa-groessen";

// Größen eines Mitglieds (PSA-Abschnitt der Mitgliederseite). Speichert über
// /api/psa/groessen/[kameradId].
export function GroessenFormular({
  kameradId,
  groessen,
  bearbeiten,
}: {
  kameradId: number;
  groessen: Groessen;
  bearbeiten: boolean;
}) {
  const router = useRouter();
  const start = (): Record<string, string> =>
    Object.fromEntries(GROESSEN_FELDER.map((f) => [f.feld, groessen[f.feld] ?? ""]));
  const [werte, setWerte] = useState<Record<string, string>>(start);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [busy, setBusy] = useState(false);

  const geaendert = GROESSEN_FELDER.some((f) => werte[f.feld] !== (groessen[f.feld] ?? ""));

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await apiCall("PATCH", `/api/psa/groessen/${kameradId}`, werte);
    setBusy(false);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: "Größen gespeichert." });
    router.refresh();
  }

  if (!bearbeiten) {
    return (
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
        {GROESSEN_FELDER.map((f) => (
          <div key={f.feld} className="grid gap-0.5">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd>{groessen[f.feld] || <span className="text-muted-foreground">–</span>}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <form onSubmit={speichern} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {GROESSEN_FELDER.map((f) => (
          <div key={f.feld} className="grid gap-2">
            <Label htmlFor={`psa-${f.feld}`}>{f.label}</Label>
            <Input
              id={`psa-${f.feld}`}
              value={werte[f.feld]}
              maxLength={20}
              onChange={(e) => setWerte({ ...werte, [f.feld]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={!geaendert}>Größen speichern</Button>
        {geaendert && (
          <Button type="button" variant="ghost" onClick={() => setWerte(start())}>Zurücksetzen</Button>
        )}
      </div>
      {meldung && (
        <p role={meldung.ok ? "status" : "alert"} className={meldung.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {meldung.text}
        </p>
      )}
    </form>
  );
}
