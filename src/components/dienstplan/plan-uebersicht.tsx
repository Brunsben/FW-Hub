"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dpApi } from "@/components/dienstplan/api";
import { datumKurz } from "@/components/dienstplan/farben";

export interface PlanZeile {
  jahr: number;
  status: "entwurf" | "freigegeben";
  version: number;
  termine: number;
  [k: string]: unknown;
}

interface VorschauTermin { datum: string; kuerzel: string; uhrzeit: string; feiertag: string | null }
interface Vorschau {
  termine: VorschauTermin[];
  vorjahr: { datum: string; kuerzel: string; ausgefallen: boolean }[];
  moeglich: boolean;
  fehler: string[];
}

export function PlanUebersicht({ plaene, istAdmin }: { plaene: PlanZeile[]; istAdmin: boolean }) {
  const [offen, setOffen] = useState(false);
  const naechstes = plaene.length ? Math.max(...plaene.map((p) => p.jahr)) + 1 : new Date().getFullYear() + 1;
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Pläne</CardTitle>
            <CardDescription>Entwürfe sehen nur Planer und Admin, freigegebene Pläne alle.</CardDescription>
          </div>
          {istAdmin && <Button onClick={() => setOffen(true)}>Neues Jahr anlegen</Button>}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jahr</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Termine</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plaene.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Noch kein Plan angelegt.</TableCell></TableRow>
              )}
              {plaene.map((p) => (
                <TableRow key={p.jahr}>
                  <TableCell className="font-medium">{p.jahr}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "freigegeben" ? "default" : "outline"}>
                      {p.status === "freigegeben" ? "Freigegeben" : "Entwurf"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.termine}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline"><Link href={`/dienstplan/${p.jahr}/bearbeiten`}>Bearbeiten</Link></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-4 text-sm">
            <Link href="/dienstplan/verwaltung">Verwaltung: Kategorien, Rhythmus, Themen, Blöcke, externe Personen</Link>
          </p>
        </CardContent>
      </Card>
      {istAdmin && <NeuesJahr offen={offen} setOffen={setOffen} vorschlag={naechstes} vorhanden={plaene.map((p) => p.jahr)} />}
    </>
  );
}

function NeuesJahr({ offen, setOffen, vorschlag, vorhanden }: { offen: boolean; setOffen: (o: boolean) => void; vorschlag: number; vorhanden: number[] }) {
  const router = useRouter();
  const [jahr, setJahr] = useState(String(vorschlag));
  const [versatz, setVersatz] = useState<0 | 2>(0);
  const [generieren, setGenerieren] = useState(true);
  const [vorschau, setVorschau] = useState<Record<0 | 2, Vorschau | null>>({ 0: null, 2: null });
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const j = Number(jahr);
  const jahrOk = Number.isInteger(j) && j >= 2000 && j <= 2100;

  useEffect(() => {
    if (!offen || !jahrOk) return;
    let aktiv = true;
    (async () => {
      const [a, b] = await Promise.all([0, 2].map((v) => dpApi<Vorschau>("GET", `/plaene/vorschau?jahr=${j}&versatz=${v}&wochen=8`)));
      if (!aktiv) return;
      setVorschau({ 0: a.ok ? a.data : null, 2: b.ok ? b.data : null });
      setFehler(!a.ok ? a.message : !b.ok ? b.message : null);
    })();
    return () => { aktiv = false; };
  }, [offen, j, jahrOk]);

  async function anlegen() {
    setBusy(true);
    setFehler(null);
    const r = await dpApi("POST", "/plaene", { jahr: j, generieren, zwischendienstVersatz: versatz });
    setBusy(false);
    if (!r.ok) { setFehler(r.message); return; }
    router.push(`/dienstplan/${j}/bearbeiten`);
  }

  return (
    <Sheet open={offen} onOpenChange={setOffen}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Neues Jahr anlegen</SheetTitle>
          <SheetDescription>
            Der Plan startet als Entwurf. Der Generator legt die Rhythmus-Termine an (Dienstabende, Zwischendienste,
            Gruppenführerrunde, Ortskommando).
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          <div className="grid gap-2">
            <Label htmlFor="neu-jahr">Jahr</Label>
            <Input id="neu-jahr" inputMode="numeric" value={jahr} onChange={(e) => setJahr(e.target.value.trim())} className="max-w-32" />
            {jahrOk && vorhanden.includes(j) && <p className="text-sm text-destructive">Für {j} gibt es schon einen Plan.</p>}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Zwischendienst</legend>
            <p className="text-sm text-muted-foreground">
              Zum Jahreswechsel kann der Zwischendienst um 2 Wochen versetzt werden (z. B. von „eine Woche nach dem
              Dienstabend“ auf „eine Woche davor“). Die Dienstabende bleiben im 14-Tage-Takt. Die Regel gilt dann ab
              dem 01.01.{jahrOk ? j : ""}.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {([0, 2] as const).map((v) => (
                <label
                  key={v}
                  className={`flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-3 ${versatz === v ? "border-primary ring-2 ring-ring/40" : "border-border"}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <input type="radio" name="versatz" checked={versatz === v} onChange={() => setVersatz(v)} disabled={v === 2 && vorschau[2]?.moeglich === false} />
                    {v === 0 ? "Wie bisher" : "Zwischendienst um 2 Wochen versetzen"}
                  </span>
                  <VorschauListe v={vorschau[v]} jahr={j} />
                </label>
              ))}
            </div>
            {vorschau[2] && !vorschau[2].moeglich && <p className="text-sm text-destructive">Versatz nicht möglich: {vorschau[2].fehler.join("; ")}</p>}
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={generieren} onChange={(e) => setGenerieren(e.target.checked)} />
            Rhythmus-Termine gleich anlegen
          </label>

          {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
          <div className="flex gap-2">
            <Button onClick={anlegen} loading={busy} disabled={!jahrOk || vorhanden.includes(j)}>Plan {jahrOk ? j : ""} anlegen</Button>
            <Button variant="outline" onClick={() => setOffen(false)}>Abbrechen</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VorschauListe({ v, jahr }: { v: Vorschau | null; jahr: number }) {
  if (!v) return <p className="text-sm text-muted-foreground">Vorschau wird geladen …</p>;
  return (
    <div className="grid gap-1 text-sm">
      {v.vorjahr.length > 0 && <p className="text-xs text-muted-foreground">Ende {jahr - 1} (Plan)</p>}
      {v.vorjahr.map((t) => (
        <p key={t.datum} className="flex gap-2 text-muted-foreground">
          <span className="w-20 tabular-nums">{datumKurz(t.datum)}</span>
          <span className="font-medium">{t.kuerzel}</span>
          {t.ausgefallen && <span>(entfällt)</span>}
        </p>
      ))}
      <p className="mt-1 text-xs text-muted-foreground">Beginn {jahr} (erste 8 Wochen)</p>
      {v.termine.map((t) => (
        <p key={`${t.datum}-${t.kuerzel}`} className="flex gap-2">
          <span className="w-20 tabular-nums">{datumKurz(t.datum)}</span>
          <span className="font-medium">{t.kuerzel}</span>
          <span className="text-muted-foreground">{t.uhrzeit}</span>
          {t.feiertag && <span className="text-warning">{t.feiertag}</span>}
        </p>
      ))}
    </div>
  );
}
