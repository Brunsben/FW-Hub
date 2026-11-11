"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DpTermin } from "@/lib/dienstplan/hinweise";
import type { DpKategorie, DpPlan } from "@/lib/dienstplan/plan";
import { plusTage, wochentag } from "@/lib/dienstplan/kalender";
import { dpApi } from "@/components/dienstplan/api";
import { datumKurz, klassenFuer, MONATE } from "@/components/dienstplan/farben";

// Mitgliederansicht (Spec 7.4): freigegebene Pläne lesen (Planer sehen auch
// Entwürfe), aktuelle Woche hervorgehoben, vergangene Termine abgeblendet,
// nächster Termin oben. Themenvorschlag einreichen und eigene Vorschläge sehen.
// Links zu iCal-Abo, PDF und Bild kommen mit den Phasen 10 und 11.

interface PlanDaten { plan: DpPlan; kategorien: DpKategorie[]; termine: DpTermin[] }
interface Vorschlag { id: number; titel: string; status: "offen" | "uebernommen" | "verworfen"; vorgeschlagenAm: string }

const STATUS = { offen: "offen", uebernommen: "übernommen", verworfen: "nicht übernommen" } as const;
const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const textarea = "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/80";

export function Mitgliederansicht({ istPlaner }: { istPlaner: boolean }) {
  const [heute] = useState(heuteIso);
  const [jahre, setJahre] = useState<{ jahr: number; status: string }[] | null>(null);
  const [jahr, setJahr] = useState<number | null>(null);
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    void dpApi<{ plaene: { jahr: number; status: string }[] }>("GET", "/plaene").then((r) => {
      if (!aktiv) return;
      if (!r.ok) { setFehler(r.message); return; }
      const liste = r.data.plaene.sort((a, b) => a.jahr - b.jahr);
      setJahre(liste);
      const aktuell = Number(heute.slice(0, 4));
      const wahl = liste.find((p) => p.jahr === aktuell) ?? liste.filter((p) => p.jahr < aktuell).at(-1) ?? liste[0];
      setJahr(wahl?.jahr ?? null);
    });
    return () => { aktiv = false; };
  }, [heute]);

  useEffect(() => {
    if (jahr === null) return;
    let aktiv = true;
    void dpApi<PlanDaten>("GET", `/plaene/${jahr}`).then((r) => {
      if (!aktiv) return;
      if (r.ok) { setDaten(r.data); setFehler(null); } else setFehler(r.message);
    });
    return () => { aktiv = false; };
  }, [jahr]);

  const montag = plusTage(heute, -(wochentag(heute) - 1));
  const sonntag = plusTage(montag, 6);
  const termine = daten?.termine ?? [];
  const naechster = termine.find((t) => t.datum >= heute && !t.ausgefallen);
  const kategorien = new Map((daten?.kategorien ?? []).map((k) => [k.id, k]));
  const monate = new Map<number, DpTermin[]>();
  for (const t of termine) {
    const m = Number(t.datum.slice(5, 7)) - 1;
    monate.set(m, [...(monate.get(m) ?? []), t]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dienstplan{jahr ? ` ${jahr}` : ""}</h1>
        <div className="flex flex-wrap gap-2">
          {(jahre ?? []).map((p) => (
            <Button key={p.jahr} size="sm" variant={p.jahr === jahr ? "default" : "outline"} onClick={() => setJahr(p.jahr)} aria-pressed={p.jahr === jahr}>
              {p.jahr}{p.status === "entwurf" && " (Entwurf)"}
            </Button>
          ))}
          {istPlaner && <Button size="sm" variant="outline" asChild><Link href="/dienstplan/planung">Planung</Link></Button>}
        </div>
      </div>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      {jahre && !jahre.length && <p className="py-10 text-center text-muted-foreground">Noch kein Dienstplan freigegeben.</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {naechster && (
            <section aria-labelledby="naechster" className="grid gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="naechster" className="text-lg font-semibold tracking-tight">Nächster Termin</h2>
                <a href={`#monat-${Number(naechster.datum.slice(5, 7)) - 1}`} className="text-sm">Zum aktuellen Monat</a>
              </div>
              <Zeile t={naechster} kategorie={kategorien.get(naechster.kategorieId)} gross />
            </section>
          )}
          {[...monate.entries()].map(([m, liste]) => (
            <section key={m} id={`monat-${m}`} aria-labelledby={`m-${m}`} className="scroll-mt-20 grid gap-2">
              <h2 id={`m-${m}`} className="text-lg font-semibold tracking-tight">{MONATE[m]}</h2>
              {liste.map((t) => (
                <Zeile key={t.id} t={t} kategorie={kategorien.get(t.kategorieId)}
                  vorbei={t.datum < heute} dieseWoche={t.datum >= montag && t.datum <= sonntag} />
              ))}
            </section>
          ))}
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <VorschlagEinreichen />
        </aside>
      </div>
    </div>
  );
}

function Zeile({ t, kategorie, vorbei = false, dieseWoche = false, gross = false }: {
  t: DpTermin; kategorie?: DpKategorie; vorbei?: boolean; dieseWoche?: boolean; gross?: boolean;
}) {
  const k = klassenFuer(kategorie?.farbe, t.ausgefallen);
  return (
    <article data-termin={t.id} data-vorbei={vorbei || undefined} data-woche={dieseWoche || undefined}
      className={cn("rounded-xl border border-l-4 p-3", k.streifen, k.flaeche, dieseWoche && "ring-2 ring-primary", vorbei && "text-muted-foreground")}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("font-semibold tabular-nums", gross && "text-lg")}>{datumKurz(t.datum)}</span>
        {t.uhrzeit && <span className="tabular-nums">{t.uhrzeit} Uhr</span>}
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 text-xs font-semibold text-foreground">
          <span aria-hidden className={cn("size-2 rounded-full", k.punkt)} />{t.kuerzel}
        </span>
        <span className="text-sm">{kategorie?.name}</span>
        {dieseWoche && <Badge>Diese Woche</Badge>}
        {t.ort && <span className="text-sm">· {t.ort}</span>}
      </div>
      {t.ausgefallen ? (
        <p className="mt-1 text-sm">entfällt{t.bemerkung ? `: ${t.bemerkung}` : ""}</p>
      ) : (
        <>
          {t.themen.map((p) => (
            <p key={p.id} className="mt-1">
              <span className="font-medium">{p.titel}</span>
              {p.verantwortliche.length > 0 && <span className="text-sm text-muted-foreground"> · {p.verantwortliche.map((v) => v.name).join(", ")}</span>}
            </p>
          ))}
          {t.bemerkung && <p className="mt-1 text-sm text-muted-foreground">{t.bemerkung}</p>}
          {t.notizen && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{t.notizen}</p>}
        </>
      )}
    </article>
  );
}

function VorschlagEinreichen() {
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [eigene, setEigene] = useState<Vorschlag[]>([]);
  const hole = useCallback(async () => {
    const r = await dpApi<{ vorschlaege: Vorschlag[] }>("GET", "/themenvorschlaege?eigene=1");
    return r.ok ? r.data.vorschlaege : [];
  }, []);
  useEffect(() => {
    let aktiv = true;
    void hole().then((v) => { if (aktiv) setEigene(v); });
    return () => { aktiv = false; };
  }, [hole]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Themenvorschlag einreichen</CardTitle>
        <CardDescription>Idee für einen Dienstabend, z. B. nach einem Einsatz. Die Gruppenführer sehen sie bei der Planung.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await dpApi("POST", "/themenvorschlaege", { titel, beschreibung: beschreibung || null });
          setBusy(false);
          if (!r.ok) { setMeldung({ ok: false, text: r.message }); return; }
          setTitel(""); setBeschreibung("");
          setMeldung({ ok: true, text: "Danke, der Vorschlag ist eingereicht." });
          setEigene(await hole());
        }}>
          <div className="grid gap-2">
            <Label htmlFor="v-titel">Titel</Label>
            <Input id="v-titel" value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="v-beschreibung">Beschreibung (optional)</Label>
            <textarea id="v-beschreibung" className={textarea} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} maxLength={2000} />
          </div>
          <Button type="submit" loading={busy} disabled={!titel.trim()}>Einreichen</Button>
          {meldung && <p role={meldung.ok ? "status" : "alert"} className={cn("text-sm", !meldung.ok && "text-destructive")}>{meldung.text}</p>}
        </form>
        {eigene.length > 0 && (
          <div className="grid gap-1">
            <p className="text-sm font-medium">Meine Vorschläge</p>
            <ul className="grid gap-1 text-sm">
              {eigene.map((v) => (
                <li key={v.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{v.titel}</span>
                  <span className="shrink-0 text-muted-foreground">{STATUS[v.status]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
