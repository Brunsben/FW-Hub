"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, GitCompare, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dpApi } from "@/components/dienstplan/api";
import { datumKurz, MONATE } from "@/components/dienstplan/farben";
import type { VersionKopf } from "@/lib/dienstplan/versionen-db";
import type { VergleichEintrag, VersionInhalt } from "@/lib/dienstplan/versionen";
import { cn } from "@/lib/utils";

type Plan = { jahr: number; status: "entwurf" | "freigegeben" };
type Vergleich = { von: number; bis: number | "aktuell"; zusammenfassung: string; aenderungen: VergleichEintrag[] };

const ART: Record<VergleichEintrag["art"], string> = { neu: "neu", entfallen: "entfallen", verschoben: "verschoben", geaendert: "geändert" };
const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
const auswahlKlasse = "h-9 rounded-md border border-input bg-background px-2 text-sm";

// Versionen eines Plans (Spec 8, Phase 9): speichern, ansehen, vergleichen,
// wiederherstellen (nur Admin). Planer und Admin.
export function Versionen({ jahr, istAdmin }: { jahr: number; istAdmin: boolean }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [versionen, setVersionen] = useState<VersionKopf[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [vergleich, setVergleich] = useState<Vergleich | null>(null);
  const [von, setVon] = useState<string>("");
  const [bis, setBis] = useState<string>("aktuell");
  const [ansicht, setAnsicht] = useState<(VersionKopf & { inhalt: VersionInhalt }) | null>(null);

  const laden = useCallback(async () => {
    const r = await dpApi<{ plan: Plan; versionen: VersionKopf[] }>("GET", `/plaene/${jahr}/versionen`);
    if (!r.ok) { setFehler(r.message); return; }
    setPlan(r.data.plan);
    setVersionen(r.data.versionen);
    return r.data.versionen;
  }, [jahr]);

  const vergleichen = useCallback(async (a: string, b: string) => {
    setBusy("vergleich");
    const q = new URLSearchParams();
    if (a) q.set("von", a);
    q.set("bis", b);
    const r = await dpApi<Vergleich>("GET", `/plaene/${jahr}/versionen/vergleich?${q}`);
    setBusy(null);
    if (!r.ok) { setMeldung({ ok: false, text: r.message }); setVergleich(null); return; }
    setVergleich(r.data);
    setVon(String(r.data.von));
    setBis(String(r.data.bis));
  }, [jahr]);

  useEffect(() => {
    void (async () => {
      const v = await laden();
      // Standard: Änderungen seit der letzten Freigabe
      if (v?.some((x) => x.anlass === "freigabe")) await vergleichen("", "aktuell");
    })();
  }, [laden, vergleichen]);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setBusy("speichern");
    const r = await dpApi<{ nummer: number }>("POST", `/plaene/${jahr}/versionen`, { bezeichnung });
    setBusy(null);
    if (!r.ok) { setMeldung({ ok: false, text: r.message }); return; }
    setBezeichnung("");
    setMeldung({ ok: true, text: `Version ${r.data.nummer} gespeichert` });
    await laden();
  }

  async function ansehen(nummer: number) {
    setBusy(`ansehen-${nummer}`);
    const r = await dpApi<{ version: VersionKopf & { inhalt: VersionInhalt } }>("GET", `/plaene/${jahr}/versionen/${nummer}`);
    setBusy(null);
    if (!r.ok) { setMeldung({ ok: false, text: r.message }); return; }
    setAnsicht(r.data.version);
    requestAnimationFrame(() => document.getElementById("version-ansicht")?.scrollIntoView({ behavior: "smooth" }));
  }

  async function wiederherstellen(nummer: number) {
    if (!confirm(`Version ${nummer} wiederherstellen? Der aktuelle Stand wird vorher als Version gesichert. ` +
      (plan?.status === "freigegeben" ? "Der Plan wird dabei wieder Entwurf; Mitglieder sehen ihn bis zur nächsten Freigabe nicht." : ""))) return;
    setBusy(`wh-${nummer}`);
    const r = await dpApi<{ gesichert: number; geaendert: number; angelegt: number; geloescht: number; hinweise: string[] }>(
      "POST", `/plaene/${jahr}/versionen/${nummer}/wiederherstellen`);
    setBusy(null);
    if (!r.ok) { setMeldung({ ok: false, text: r.message }); return; }
    const d = r.data;
    setMeldung({
      ok: true,
      text: `Version ${nummer} wiederhergestellt (vorheriger Stand als Version ${d.gesichert} gesichert): ${d.geaendert} geändert, ${d.angelegt} angelegt, ${d.geloescht} gelöscht.` +
        (d.hinweise.length ? ` Hinweise: ${d.hinweise.join("; ")}` : ""),
    });
    await laden();
    await vergleichen(String(nummer), "aktuell");
  }

  if (fehler) return <p role="alert" className="text-sm text-destructive">{fehler}</p>;
  if (!plan) return <p className="text-sm text-muted-foreground">Versionen werden geladen …</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Versionen {jahr}</h1>
          <Badge variant={plan.status === "entwurf" ? "outline" : "default"}>{plan.status === "entwurf" ? "Entwurf" : "Freigegeben"}</Badge>
        </div>
        <Button variant="outline" size="sm" asChild><Link href={`/dienstplan/${jahr}/bearbeiten`}>Zur Eingabemaske</Link></Button>
      </div>

      {meldung && (
        <p role={meldung.ok ? "status" : "alert"} className={cn("rounded-md border px-3 py-2 text-sm", meldung.ok ? "border-success bg-success/10" : "border-destructive bg-destructive/10")}>
          {meldung.text}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stand speichern</CardTitle>
          <CardDescription>Bei der Freigabe wird automatisch eine Version angelegt. Zusätzlich jederzeit von Hand, z. B. „Stand nach GF-Sitzung“.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={speichern} className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-2 sm:max-w-md">
              <Label htmlFor="v-bezeichnung">Bezeichnung</Label>
              <Input id="v-bezeichnung" required maxLength={120} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="Stand nach GF-Sitzung" />
            </div>
            <Button type="submit" loading={busy === "speichern"}><Save /> Version speichern</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verlauf</CardTitle>
          <CardDescription>Versionen sind schreibgeschützt und werden nie gelöscht.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nr.</TableHead>
                <TableHead>Anlass</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead>Termine</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versionen.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Noch keine Version. Die erste entsteht bei der Freigabe oder mit „Version speichern“.</TableCell></TableRow>
              )}
              {versionen.map((v) => (
                <TableRow key={v.nummer} data-version={v.nummer}>
                  <TableCell className="tabular-nums">{v.nummer}</TableCell>
                  <TableCell><Badge variant={v.anlass === "freigabe" ? "default" : "outline"}>{v.anlass === "freigabe" ? "Freigabe" : "manuell"}</Badge></TableCell>
                  <TableCell>{v.bezeichnung ?? "–"}</TableCell>
                  <TableCell className="text-sm">{zeit(v.erstelltAm)} · {v.erstelltVonName}</TableCell>
                  <TableCell className="tabular-nums">{v.anzahlTermine}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" loading={busy === `ansehen-${v.nummer}`} onClick={() => void ansehen(v.nummer)}><Eye /> Ansehen</Button>
                      <Button size="sm" variant="ghost" onClick={() => void vergleichen(String(v.nummer), "aktuell")}><GitCompare /> Mit aktuell</Button>
                      {istAdmin && (
                        <Button size="sm" variant="ghost" loading={busy === `wh-${v.nummer}`} onClick={() => void wiederherstellen(v.nummer)}><RotateCcw /> Wiederherstellen</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {versionen.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vergleich</CardTitle>
            <CardDescription>Termine neu, entfallen, verschoben oder geändert (Thema, Verantwortliche, sonstige Angaben).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="v-von">Von</Label>
                <select id="v-von" className={auswahlKlasse} value={von} onChange={(e) => setVon(e.target.value)}>
                  <option value="" disabled>Version wählen</option>
                  {versionen.map((v) => <option key={v.nummer} value={v.nummer}>Version {v.nummer}{v.bezeichnung ? ` – ${v.bezeichnung}` : ""}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="v-bis">Bis</Label>
                <select id="v-bis" className={auswahlKlasse} value={bis} onChange={(e) => setBis(e.target.value)}>
                  <option value="aktuell">aktueller Stand</option>
                  {versionen.map((v) => <option key={v.nummer} value={v.nummer}>Version {v.nummer}</option>)}
                </select>
              </div>
              <Button variant="outline" disabled={!von} loading={busy === "vergleich"} onClick={() => void vergleichen(von, bis)}><GitCompare /> Vergleichen</Button>
            </div>
            {vergleich && (
              <div className="grid gap-2" data-testid="vergleich">
                <p className="text-sm font-medium">
                  Version {vergleich.von} → {vergleich.bis === "aktuell" ? "aktueller Stand" : `Version ${vergleich.bis}`}: {vergleich.zusammenfassung}
                </p>
                {vergleich.aenderungen.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Termin</TableHead>
                        <TableHead>Art</TableHead>
                        <TableHead>Vorher</TableHead>
                        <TableHead>Nachher</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vergleich.aenderungen.map((a) => (
                        <TableRow key={`${a.art}-${a.terminId}`} data-art={a.art}>
                          <TableCell className="whitespace-nowrap tabular-nums">{datumKurz(a.datum)} <span className="text-xs text-muted-foreground">{a.kuerzel}</span></TableCell>
                          <TableCell>
                            <Badge variant={a.art === "entfallen" ? "destructive" : a.art === "neu" ? "default" : "secondary"}>{ART[a.art]}</Badge>
                            {a.details.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{a.details.join(", ")}</div>}
                          </TableCell>
                          <TableCell className="text-sm">{a.alt ? `${a.alt.uhrzeit ?? ""} ${a.alt.titel || "ohne Thema"}` : "–"}</TableCell>
                          <TableCell className="text-sm">{a.neu ? `${a.neu.uhrzeit ?? ""} ${a.neu.titel || "ohne Thema"}` : "–"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ansicht && (
        <Card id="version-ansicht" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Version {ansicht.nummer}{ansicht.bezeichnung ? ` – ${ansicht.bezeichnung}` : ""}</CardTitle>
            <CardDescription>Stand vom {zeit(ansicht.erstelltAm)}, schreibgeschützt. Namen wie zum Zeitpunkt der Version.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {[...Array(12).keys()].map((m) => {
              const liste = ansicht.inhalt.termine.filter((t) => Number(t.datum.slice(5, 7)) - 1 === m);
              if (!liste.length) return null;
              return (
                <section key={m} className="grid gap-1">
                  <h2 className="text-base font-semibold">{MONATE[m]}</h2>
                  {liste.map((t) => (
                    <p key={t.id} className={cn("text-sm", t.ausgefallen && "text-muted-foreground line-through")}>
                      <span className="tabular-nums font-medium">{datumKurz(t.datum)}</span>{" "}
                      {t.uhrzeit && <span className="tabular-nums">{t.uhrzeit} </span>}
                      <span className="text-xs font-semibold">{t.kuerzel}</span>{" "}
                      {t.themen.map((p) => `${p.titel}${p.verantwortliche.length ? ` (${p.verantwortliche.map((v) => v.name).join(", ")})` : ""}`).join(" / ") || "ohne Thema"}
                    </p>
                  ))}
                </section>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
