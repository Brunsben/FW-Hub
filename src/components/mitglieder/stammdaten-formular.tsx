"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiCall, type Meldung } from "./api-client";

export interface StammdatenAnsicht {
  id: number;
  vorname: string;
  name: string;
  dienstgrad: string | null;
  email: string | null;
  personalnummer: string | null;
  aktiv: boolean;
}

const FELDER = [
  { key: "vorname", label: "Vorname", pflicht: true },
  { key: "name", label: "Nachname", pflicht: true },
  { key: "dienstgrad", label: "Dienstgrad", pflicht: false },
  { key: "personalnummer", label: "Personalnummer", pflicht: false },
  { key: "email", label: "E-Mail", pflicht: false },
] as const;

type FeldKey = (typeof FELDER)[number]["key"];

export function StammdatenFormular({
  mitglied,
  bearbeiten,
  eigene,
}: {
  mitglied: StammdatenAnsicht;
  bearbeiten: boolean;
  /** Die angemeldete Person selbst: Sie kann sich nicht deaktivieren. */
  eigene: boolean;
}) {
  const router = useRouter();
  const [werte, setWerte] = useState<Record<FeldKey, string>>({
    vorname: mitglied.vorname,
    name: mitglied.name,
    dienstgrad: mitglied.dienstgrad ?? "",
    personalnummer: mitglied.personalnummer ?? "",
    email: mitglied.email ?? "",
  });
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [busy, setBusy] = useState<"speichern" | "aktiv" | null>(null);

  const geaendert = FELDER.some((f) => werte[f.key] !== (mitglied[f.key] ?? ""));

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setBusy("speichern");
    const r = await apiCall("PATCH", `/api/mitglieder/${mitglied.id}`, werte);
    setBusy(null);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: "Stammdaten gespeichert." });
    router.refresh();
  }

  async function aktivUmschalten() {
    const ziel = !mitglied.aktiv;
    const frage = ziel
      ? `${mitglied.vorname} ${mitglied.name} wieder aktivieren? Der Login bleibt gesperrt und wird unter "Zugang" separat freigegeben.`
      : `${mitglied.vorname} ${mitglied.name} deaktivieren? Ein vorhandener Login wird dabei gesperrt.`;
    if (!window.confirm(frage)) return;
    setBusy("aktiv");
    const r = await apiCall("PATCH", `/api/mitglieder/${mitglied.id}`, { aktiv: ziel });
    setBusy(null);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: ziel ? "Mitglied aktiviert." : "Mitglied deaktiviert." });
    router.refresh();
  }

  const status = (
    <Badge variant={mitglied.aktiv ? "secondary" : "destructive"}>
      {mitglied.aktiv ? "aktiv" : "inaktiv"}
    </Badge>
  );

  if (!bearbeiten) {
    return (
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {FELDER.map((f) => (
          <div key={f.key} className="grid gap-0.5">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="break-words">{mitglied[f.key] || <span className="text-muted-foreground">–</span>}</dd>
          </div>
        ))}
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{status}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={speichern} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FELDER.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label htmlFor={`stamm-${f.key}`}>
                {f.label}
                {f.pflicht && <span aria-hidden> *</span>}
              </Label>
              <Input
                id={`stamm-${f.key}`}
                type={f.key === "email" ? "email" : "text"}
                value={werte[f.key]}
                required={f.pflicht}
                maxLength={f.key === "email" ? 200 : 100}
                onChange={(e) => setWerte({ ...werte, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy === "speichern"} disabled={!geaendert}>
            Speichern
          </Button>
          {geaendert && (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setWerte({
                  vorname: mitglied.vorname,
                  name: mitglied.name,
                  dienstgrad: mitglied.dienstgrad ?? "",
                  personalnummer: mitglied.personalnummer ?? "",
                  email: mitglied.email ?? "",
                })
              }
            >
              Zurücksetzen
            </Button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <span className="text-sm text-muted-foreground">Status</span>
        {status}
        <Button
          type="button"
          variant={mitglied.aktiv ? "outline" : "default"}
          size="sm"
          loading={busy === "aktiv"}
          disabled={mitglied.aktiv && eigene}
          onClick={aktivUmschalten}
        >
          {mitglied.aktiv ? "Deaktivieren" : "Aktivieren"}
        </Button>
        {mitglied.aktiv && eigene && (
          <span className="text-xs text-muted-foreground">
            Den eigenen Kameraden kannst du nicht deaktivieren.
          </span>
        )}
      </div>

      {meldung && (
        <p
          role={meldung.ok ? "status" : "alert"}
          className={meldung.ok ? "text-sm text-success" : "text-sm text-destructive"}
        >
          {meldung.text}
        </p>
      )}
    </div>
  );
}
