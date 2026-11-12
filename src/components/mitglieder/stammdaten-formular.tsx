"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
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
  spitzname: string | null;
  spitznameAnzeigen: boolean;
  aktiv: boolean;
}

/** Automatisch erzeugter Anzeigename (lib/mitglieder/anzeigename.ts). */
export interface AnzeigenameAnsicht {
  text: string;
  mehrdeutig: boolean;
}

const FELDER = [
  { key: "vorname", label: "Vorname", pflicht: true },
  { key: "name", label: "Nachname", pflicht: true },
  { key: "dienstgrad", label: "Dienstgrad", pflicht: false },
  { key: "personalnummer", label: "Personalnummer", pflicht: false },
  { key: "email", label: "E-Mail", pflicht: false },
  { key: "spitzname", label: "Spitzname", pflicht: false },
] as const;

const MAX_LAENGE: Record<FeldKey, number> = {
  vorname: 100,
  name: 100,
  dienstgrad: 50,
  personalnummer: 50,
  email: 200,
  spitzname: 30,
};

type FeldKey = (typeof FELDER)[number]["key"];

export function StammdatenFormular({
  mitglied,
  bearbeiten,
  eigene,
  anzeigename,
}: {
  mitglied: StammdatenAnsicht;
  bearbeiten: boolean;
  /** Die angemeldete Person selbst: Sie kann sich nicht deaktivieren. */
  eigene: boolean;
  /** Nur, wenn der Betrachter alle aktiven Kameraden sieht (sonst falsch). */
  anzeigename?: AnzeigenameAnsicht;
}) {
  const router = useRouter();
  const ausgangswerte = (): Record<FeldKey, string> => ({
    vorname: mitglied.vorname,
    name: mitglied.name,
    dienstgrad: mitglied.dienstgrad ?? "",
    personalnummer: mitglied.personalnummer ?? "",
    email: mitglied.email ?? "",
    spitzname: mitglied.spitzname ?? "",
  });
  const [werte, setWerte] = useState<Record<FeldKey, string>>(ausgangswerte);
  const [spitznameAnzeigen, setSpitznameAnzeigen] = useState(mitglied.spitznameAnzeigen);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [busy, setBusy] = useState<"speichern" | "aktiv" | null>(null);

  const geaendert =
    FELDER.some((f) => werte[f.key] !== (mitglied[f.key] ?? "")) ||
    spitznameAnzeigen !== mitglied.spitznameAnzeigen;

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setBusy("speichern");
    const r = await apiCall("PATCH", `/api/mitglieder/${mitglied.id}`, { ...werte, spitznameAnzeigen });
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

  const anzeige = anzeigename && (
    <div className="grid gap-2 text-sm">
      <p>
        <span className="text-muted-foreground">Anzeigename (z. B. im Dienstplan): </span>
        <span className="font-medium">{anzeigename.text}</span>
      </p>
      {anzeigename.mehrdeutig && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            Vor- und Nachname gibt es bei den aktiven Mitgliedern mehrfach. Bitte einen Spitznamen
            vergeben und &bdquo;Spitzname anzeigen&ldquo; einschalten, damit die Personen
            unterscheidbar sind.
          </p>
        </div>
      )}
    </div>
  );

  if (!bearbeiten) {
    return (
      <div className="grid gap-4">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {FELDER.map((f) => (
            <div key={f.key} className="grid gap-0.5">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="break-words">
                {mitglied[f.key] || <span className="text-muted-foreground">–</span>}
                {f.key === "spitzname" && mitglied.spitzname && (
                  <span className="text-muted-foreground">
                    {mitglied.spitznameAnzeigen ? " (wird angezeigt)" : " (wird nicht angezeigt)"}
                  </span>
                )}
              </dd>
            </div>
          ))}
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{status}</dd>
          </div>
        </dl>
        {anzeige}
      </div>
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
                maxLength={MAX_LAENGE[f.key]}
                onChange={(e) => setWerte({ ...werte, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <label className="flex items-center gap-2 self-end text-sm sm:pb-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={spitznameAnzeigen}
              onChange={(e) => setSpitznameAnzeigen(e.target.checked)}
            />
            Spitzname anzeigen (statt des automatischen Namens)
          </label>
        </div>
        {anzeige}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy === "speichern"} disabled={!geaendert}>
            Speichern
          </Button>
          {geaendert && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setWerte(ausgangswerte());
                setSpitznameAnzeigen(mitglied.spitznameAnzeigen);
              }}
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
