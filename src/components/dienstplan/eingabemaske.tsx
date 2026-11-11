"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MoveRight, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DpHinweis, DpTermin, DpTerminThema } from "@/lib/dienstplan/hinweise";
import type { DpKategorie, DpPlan } from "@/lib/dienstplan/plan";
import { dpApi } from "@/components/dienstplan/api";
import { datumKurz, klassenFuer, MONATE } from "@/components/dienstplan/farben";

interface PlanDaten { plan: DpPlan; kategorien: DpKategorie[]; termine: DpTermin[]; hinweise: DpHinweis[] }
interface Thema { id: number; titel: string; aktiv: boolean; zuletzt: string | null; pflichtJaehrlich: boolean }
interface Block { id: number; name: string; aktiv: boolean; themen: { themaId: number; titel: string }[] }
interface Personen { kameraden: { id: number; anzeige: string }[]; externe: { id: number; anzeige: string }[] }

const holePlan = (jahr: number) => dpApi<PlanDaten>("GET", `/plaene/${jahr}`);
async function holeKataloge() {
  const [t, b, p] = await Promise.all([
    dpApi<{ themen: Thema[] }>("GET", "/themen"),
    dpApi<{ bloecke: Block[] }>("GET", "/bloecke"),
    dpApi<Personen>("GET", "/personen"),
  ]);
  return { t, b, p };
}

const textarea = "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/80";
const datumLang = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

export function Eingabemaske({ jahr, istAdmin }: { jahr: number; istAdmin: boolean }) {
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [themen, setThemen] = useState<Thema[]>([]);
  const [bloecke, setBloecke] = useState<Block[]>([]);
  const [personen, setPersonen] = useState<Personen>({ kameraden: [], externe: [] });
  const [terminId, setTerminId] = useState<number | null>(null);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<DpTermin | "neu" | null>(null);
  const [verschieben, setVerschieben] = useState<DpTerminThema | null>(null);

  const uebernehmePlan = useCallback((r: Awaited<ReturnType<typeof holePlan>>) => {
    if (r.ok) { setDaten(r.data); setLadefehler(null); } else setLadefehler(r.message);
  }, []);
  const uebernehmeKataloge = useCallback((k: Awaited<ReturnType<typeof holeKataloge>>) => {
    if (k.t.ok) setThemen(k.t.data.themen);
    if (k.b.ok) setBloecke(k.b.data.bloecke);
    if (k.p.ok) setPersonen(k.p.data);
  }, []);
  const laden = useCallback(async () => uebernehmePlan(await holePlan(jahr)), [jahr, uebernehmePlan]);
  const katalogeLaden = useCallback(async () => uebernehmeKataloge(await holeKataloge()), [uebernehmeKataloge]);
  useEffect(() => {
    let aktiv = true;
    void Promise.all([holePlan(jahr), holeKataloge()]).then(([plan, kataloge]) => {
      if (!aktiv) return;
      uebernehmePlan(plan);
      uebernehmeKataloge(kataloge);
    });
    return () => { aktiv = false; };
  }, [jahr, uebernehmePlan, uebernehmeKataloge]);

  /** Aktion ausführen, Meldung setzen, Plan neu laden. */
  const aktion = useCallback(async (method: string, pfad: string, body?: unknown, erfolg?: string) => {
    setBusy(true);
    const r = await dpApi(method, pfad, body);
    setBusy(false);
    if (r.ok) await laden(); // Meldung erst nach dem Neuladen, damit sie zum angezeigten Stand passt
    setMeldung(r.ok ? (erfolg ? { ok: true, text: erfolg } : null) : { ok: false, text: r.message });
    return r;
  }, [laden]);

  const kategorien = useMemo(() => new Map((daten?.kategorien ?? []).map((k) => [k.id, k])), [daten]);
  const termin = daten?.termine.find((t) => t.id === terminId) ?? null;
  const position = termin?.themen.find((p) => p.id === positionId) ?? null;

  if (ladefehler) return <p role="alert" className="text-sm text-destructive">{ladefehler}</p>;
  if (!daten) return <p className="text-sm text-muted-foreground">Plan wird geladen …</p>;
  const { plan, termine, hinweise } = daten;
  const entwurf = plan.status === "entwurf";

  const monate = new Map<number, DpTermin[]>();
  for (const t of termine) {
    const m = Number(t.datum.slice(5, 7)) - 1;
    monate.set(m, [...(monate.get(m) ?? []), t]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dienstplan {jahr}</h1>
          <Badge variant={entwurf ? "outline" : "default"}>{entwurf ? "Entwurf" : "Freigegeben"}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link href="/dienstplan/planung">Alle Pläne</Link></Button>
          {entwurf && (
            <Button variant="outline" size="sm" loading={busy} onClick={async () => {
              const r = await aktion("POST", `/plaene/${jahr}/generieren`);
              if (r.ok) setMeldung({ ok: true, text: `${(r.data as { generiert: { neu: number } }).generiert.neu} Rhythmus-Termine ergänzt` });
            }}>Rhythmus ergänzen</Button>
          )}
          <Button size="sm" onClick={() => setBearbeiten("neu")}><Plus /> Termin</Button>
          {istAdmin && (
            <Button size="sm" variant={entwurf ? "default" : "outline"} loading={busy}
              onClick={() => aktion("PATCH", `/plaene/${jahr}`, { status: entwurf ? "freigegeben" : "entwurf" }, entwurf ? "Plan freigegeben" : "Freigabe zurückgenommen")}>
              {entwurf ? "Freigeben" : "Zurück auf Entwurf"}
            </Button>
          )}
        </div>
      </div>

      {meldung && (
        <p role={meldung.ok ? "status" : "alert"} className={cn("rounded-md border px-3 py-2 text-sm", meldung.ok ? "border-success bg-success/10" : "border-destructive bg-destructive/10")}>
          {meldung.text}
        </p>
      )}

      <Hinweise hinweise={hinweise} waehle={(id) => { setTerminId(id); setPositionId(null); document.getElementById(`termin-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {[...monate.entries()].map(([m, liste]) => (
            <section key={m} aria-labelledby={`monat-${m}`} className="flex flex-col gap-3">
              <h2 id={`monat-${m}`} className="text-lg font-semibold tracking-tight">{MONATE[m]}</h2>
              {liste.map((t) => (
                <TerminKarte
                  key={t.id}
                  t={t}
                  kategorie={kategorien.get(t.kategorieId)}
                  gewaehlt={t.id === terminId}
                  positionId={positionId}
                  busy={busy}
                  waehle={() => { setTerminId(t.id); if (t.id !== terminId) setPositionId(null); }}
                  waehlePosition={(id) => { setTerminId(t.id); setPositionId(id); }}
                  bearbeiten={() => setBearbeiten(t)}
                  verschieben={setVerschieben}
                  aktion={aktion}
                />
              ))}
            </section>
          ))}
          {termine.length === 0 && <p className="py-10 text-center text-muted-foreground">Noch keine Termine. „Rhythmus ergänzen“ oder „Termin“ anlegen.</p>}
        </div>

        <Seitenleiste
          termine={termine}
          termin={termin}
          position={position}
          themen={themen}
          bloecke={bloecke}
          personen={personen}
          busy={busy}
          aktion={aktion}
          katalogeLaden={katalogeLaden}
        />
      </div>

      {bearbeiten !== null && <TerminFormular
        key={bearbeiten === "neu" ? "neu" : bearbeiten.id}
        schliessen={() => setBearbeiten(null)}
        termin={bearbeiten === "neu" ? null : bearbeiten}
        jahr={jahr}
        kategorien={daten.kategorien.filter((k) => k.aktiv)}
        speichern={async (werte) => {
          const r = bearbeiten === "neu"
            ? await aktion("POST", `/plaene/${jahr}/termine`, werte, "Termin angelegt")
            : await aktion("PATCH", `/termine/${(bearbeiten as DpTermin).id}`, werte, "Termin gespeichert");
          if (r.ok) setBearbeiten(null);
          return r.ok ? null : r.message;
        }}
      />}

      <Sheet open={verschieben !== null} onOpenChange={(o) => !o && setVerschieben(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Thema verschieben</SheetTitle>
            <SheetDescription>„{verschieben?.titel}“ samt Verantwortlichen in einen anderen Termin, dort ans Ende.</SheetDescription>
          </SheetHeader>
          <ul className="grid gap-1 px-4 pb-6">
            {termine.filter((t) => !t.ausgefallen && !t.themen.some((p) => p.id === verschieben?.id)).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={async () => {
                    const r = await aktion("PATCH", `/termin-themen/${verschieben!.id}`, { terminId: t.id }, "Thema verschoben");
                    if (r.ok) setVerschieben(null);
                  }}
                >
                  <span className="tabular-nums">{datumKurz(t.datum)}</span> <span className="font-medium">{t.kuerzel}</span>{" "}
                  <span className="text-muted-foreground">{t.themen.map((p) => p.titel).join(" / ") || "ohne Thema"}</span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type AktionFn = (method: string, pfad: string, body?: unknown, erfolg?: string) => Promise<{ ok: boolean }>;

function Hinweise({ hinweise, waehle }: { hinweise: DpHinweis[]; waehle: (terminId: number) => void }) {
  const [alle, setAlle] = useState(false);
  if (!hinweise.length) return null;
  const pflicht = hinweise.filter((h) => h.art === "pflichtthema");
  const rest = hinweise.filter((h) => h.art !== "pflichtthema");
  const sichtbar = alle ? rest : rest.slice(0, 6);
  return (
    <Card className="border-warning">
      <CardHeader className="pb-2"><CardTitle className="text-base">Hinweise ({hinweise.length})</CardTitle></CardHeader>
      <CardContent className="-mt-4 grid gap-1 text-sm">
        {pflicht.map((h) => <p key={h.text} className="font-medium">{h.text}</p>)}
        {sichtbar.map((h, i) => (
          <p key={`${h.art}-${h.terminId}-${i}`}>
            {h.terminId ? <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => waehle(h.terminId!)}>{h.text}</button> : h.text}
          </p>
        ))}
        {rest.length > 6 && (
          <button type="button" className="justify-self-start text-sm text-primary underline-offset-4 hover:underline" onClick={() => setAlle(!alle)}>
            {alle ? "Weniger anzeigen" : `Alle ${rest.length} anzeigen`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function TerminKarte({ t, kategorie, gewaehlt, positionId, busy, waehle, waehlePosition, bearbeiten, verschieben, aktion }: {
  t: DpTermin; kategorie?: DpKategorie; gewaehlt: boolean; positionId: number | null; busy: boolean;
  waehle: () => void; waehlePosition: (id: number) => void; bearbeiten: () => void;
  verschieben: (p: DpTerminThema) => void; aktion: AktionFn;
}) {
  const k = klassenFuer(kategorie?.farbe, t.ausgefallen);
  return (
    <article id={`termin-${t.id}`} className={cn("rounded-xl border border-l-4 p-3 shadow-xs", k.streifen, k.flaeche, gewaehlt && "ring-2 ring-ring")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={waehle} aria-pressed={gewaehlt} className="flex flex-wrap items-baseline gap-x-2 text-left">
          <span className="font-semibold tabular-nums">{datumKurz(t.datum)}</span>
          {t.uhrzeit && <span className="tabular-nums">{t.uhrzeit}</span>}
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 text-xs font-semibold">
            <span aria-hidden className={cn("size-2 rounded-full", k.punkt)} />{t.kuerzel}
          </span>
          <span className="text-sm text-muted-foreground">{kategorie?.name}</span>
          {t.feiertag && <span className="text-sm font-medium text-warning">{t.feiertag}</span>}
          {t.ort && <span className="text-sm text-muted-foreground">· {t.ort}</span>}
        </button>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Termin bearbeiten" onClick={bearbeiten}><Pencil /></Button>
          <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={t.ausgefallen ? "Termin wieder aufnehmen" : "Termin absagen"}
            onClick={() => aktion("PATCH", `/termine/${t.id}`, { ausgefallen: !t.ausgefallen }, t.ausgefallen ? "Termin wieder aufgenommen" : "Termin abgesagt")}>
            {t.ausgefallen ? <RotateCcw /> : <X />}
          </Button>
          {t.quelle === "manuell" && (
            <Button size="icon-sm" variant="ghost" disabled={busy} aria-label="Termin löschen"
              onClick={() => { if (confirm(`Termin ${datumKurz(t.datum)} löschen?`)) void aktion("DELETE", `/termine/${t.id}`, undefined, "Termin gelöscht"); }}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      {t.ausgefallen && <p className="mt-1 text-sm text-muted-foreground">entfällt{t.bemerkung ? `: ${t.bemerkung}` : ""}</p>}
      {!t.ausgefallen && t.bemerkung && <p className="mt-1 text-sm text-muted-foreground">{t.bemerkung}</p>}
      {t.themen.length > 0 && (
        <ol className="mt-2 grid gap-1.5">
          {t.themen.map((p, i) => (
            <li key={p.id} className={cn("rounded-lg bg-card/70 px-2 py-1.5", positionId === p.id && "ring-2 ring-ring")}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => waehlePosition(p.id)} aria-pressed={positionId === p.id} className={cn("text-left text-sm font-medium", t.ausgefallen && "line-through")}>
                  {p.titel}{p.freitext && <span className="font-normal text-muted-foreground"> (Freitext)</span>}
                  {p.ausBlockId && <span className="font-normal text-muted-foreground"> · Block</span>}
                </button>
                <div className="flex shrink-0 gap-0.5">
                  <Button size="icon-xs" variant="ghost" aria-label="Nach oben" disabled={busy || i === 0}
                    onClick={() => aktion("PATCH", `/termin-themen/${p.id}`, { position: p.position - 1 })}><ArrowUp /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Nach unten" disabled={busy || i === t.themen.length - 1}
                    onClick={() => aktion("PATCH", `/termin-themen/${p.id}`, { position: p.position + 1 })}><ArrowDown /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label="In anderen Termin verschieben" disabled={busy} onClick={() => verschieben(p)}><MoveRight /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Thema entfernen" disabled={busy}
                    onClick={() => aktion("DELETE", `/termin-themen/${p.id}`, undefined, "Thema entfernt")}><Trash2 /></Button>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.verantwortliche.map((v) => (
                  <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs">
                    {v.name}
                    <button type="button" aria-label={`${v.name} entfernen`} className="rounded-full hover:bg-accent" disabled={busy}
                      onClick={() => aktion("DELETE", `/termin-verantwortliche/${v.id}`)}><X className="size-3" /></button>
                  </span>
                ))}
                {!p.verantwortliche.length && <span className="text-xs text-muted-foreground">ohne Verantwortliche</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {gewaehlt && <FreitextZeile terminId={t.id} aktion={aktion} busy={busy} />}
    </article>
  );
}

function FreitextZeile({ terminId, aktion, busy }: { terminId: number; aktion: AktionFn; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <form className="mt-2 flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      const r = await aktion("POST", `/termine/${terminId}/themen`, { titelFreitext: text }, "Freitext hinzugefügt");
      if (r.ok) setText("");
    }}>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Freitext (z. B. Weihnachtsfeier)" aria-label="Freitext-Thema" className="h-8 bg-card" />
      <Button size="sm" type="submit" variant="outline" disabled={busy || !text.trim()}>Hinzufügen</Button>
    </form>
  );
}

function Seitenleiste({ termine, termin, position, themen, bloecke, personen, busy, aktion, katalogeLaden }: {
  termine: DpTermin[]; termin: DpTermin | null; position: DpTerminThema | null; themen: Thema[]; bloecke: Block[];
  personen: Personen; busy: boolean; aktion: AktionFn; katalogeLaden: () => Promise<void>;
}) {
  const [reiter, setReiter] = useState<"themen" | "bloecke" | "personen">("themen");
  const [suche, setSuche] = useState("");
  const [nurUnverplant, setNurUnverplant] = useState(false);
  const [neuesThema, setNeuesThema] = useState("");
  const [extern, setExtern] = useState({ name: "", organisation: "" });

  const aktiv = termine.filter((t) => !t.ausgefallen);
  const themaAnzahl = new Map<number, number>();
  const personAnzahl = new Map<string, number>();
  for (const t of aktiv) for (const p of t.themen) {
    if (p.themaId) themaAnzahl.set(p.themaId, (themaAnzahl.get(p.themaId) ?? 0) + 1);
    for (const v of p.verantwortliche) {
      const k = v.kameradId ? `k${v.kameradId}` : v.externePersonId ? `e${v.externePersonId}` : "";
      if (k) personAnzahl.set(k, (personAnzahl.get(k) ?? 0) + 1);
    }
  }
  const s = suche.trim().toLocaleLowerCase("de-DE");
  const passt = (text: string) => !s || text.toLocaleLowerCase("de-DE").includes(s);

  const zuTermin = (body: unknown, text: string) => termin && aktion("POST", `/termine/${termin.id}/themen`, body, text);
  const zuPosition = (body: unknown) => position && aktion("POST", `/termin-themen/${position.id}/verantwortliche`, body, "Verantwortliche hinzugefügt");

  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start">
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="gap-2 pb-2">
          <p className="text-sm text-muted-foreground">
            {termin ? <>Termin: <span className="font-medium text-foreground">{datumKurz(termin.datum)} {termin.kuerzel}</span></> : "Erst einen Termin anklicken."}
            {position && <><br />Thema: <span className="font-medium text-foreground">{position.titel}</span></>}
          </p>
          <div role="tablist" aria-label="Seitenleiste" className="flex gap-1 rounded-lg bg-muted p-1">
            {(["themen", "bloecke", "personen"] as const).map((r) => (
              <button key={r} type="button" role="tab" aria-selected={reiter === r} onClick={() => setReiter(r)}
                className={cn("flex-1 rounded-md px-2 py-1 text-sm", reiter === r ? "bg-card font-medium shadow-xs" : "text-muted-foreground")}>
                {r === "themen" ? "Themen" : r === "bloecke" ? "Blöcke" : "Personen"}
              </button>
            ))}
          </div>
          {reiter !== "bloecke" && <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen" aria-label="Suchen" className="h-8" />}
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto">
          {reiter === "themen" && (
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={nurUnverplant} onChange={(e) => setNurUnverplant(e.target.checked)} />
                Nur im Jahr noch nicht verplant
              </label>
              <ul className="grid gap-0.5">
                {themen.filter((t) => t.aktiv && passt(t.titel) && (!nurUnverplant || !themaAnzahl.get(t.id))).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-accent">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate">{t.titel}{t.pflichtJaehrlich && <span className="text-muted-foreground"> · Pflicht</span>}</span>
                      <span className="block text-xs text-muted-foreground">
                        {themaAnzahl.get(t.id) ? `${themaAnzahl.get(t.id)}× im Plan` : "nicht im Plan"}{t.zuletzt ? ` · zuletzt ${datumLang(t.zuletzt)}` : ""}
                      </span>
                    </span>
                    <Button size="icon-sm" variant="outline" aria-label={`${t.titel} zum Termin`} disabled={busy || !termin}
                      onClick={() => zuTermin({ themaId: t.id }, "Thema hinzugefügt")}><Plus /></Button>
                  </li>
                ))}
              </ul>
              <form className="flex gap-2 border-t pt-2" onSubmit={async (e) => {
                e.preventDefault();
                const r = await dpApi<{ id: number }>("POST", "/themen", { titel: neuesThema });
                if (!r.ok) { alert(r.message); return; }
                setNeuesThema("");
                await katalogeLaden();
                if (termin) await zuTermin({ themaId: r.data.id }, "Thema angelegt und hinzugefügt");
              }}>
                <Input value={neuesThema} onChange={(e) => setNeuesThema(e.target.value)} placeholder="Neues Thema" aria-label="Neues Thema" className="h-8" />
                <Button size="sm" type="submit" variant="outline" disabled={busy || !neuesThema.trim()}>Anlegen</Button>
              </form>
            </div>
          )}
          {reiter === "bloecke" && (
            <ul className="grid gap-1">
              {bloecke.filter((b) => b.aktiv).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-accent">
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{b.name}</span>
                    <span className="block text-xs text-muted-foreground">{b.themen.map((t) => t.titel).join(" · ")}</span>
                  </span>
                  <Button size="icon-sm" variant="outline" aria-label={`Block ${b.name} zum Termin`} disabled={busy || !termin}
                    onClick={() => zuTermin({ blockId: b.id }, "Block hinzugefügt")}><Plus /></Button>
                </li>
              ))}
              {!bloecke.some((b) => b.aktiv) && <li className="py-6 text-center text-sm text-muted-foreground">Keine Blöcke. Anlegen in der Verwaltung.</li>}
            </ul>
          )}
          {reiter === "personen" && (
            <div className="grid gap-2">
              {!position && <p className="text-sm text-muted-foreground">Für Verantwortliche ein Thema im Termin anklicken.</p>}
              <ul className="grid gap-0.5">
                {[...personen.kameraden.map((k) => ({ ...k, schluessel: `k${k.id}`, body: { kameradId: k.id } })),
                  ...personen.externe.map((e) => ({ ...e, schluessel: `e${e.id}`, body: { externePersonId: e.id } }))]
                  .filter((p) => passt(p.anzeige))
                  .map((p) => (
                    <li key={p.schluessel} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-accent">
                      <span className="text-sm">
                        {p.anzeige}{p.schluessel.startsWith("e") && <span className="text-muted-foreground"> · extern</span>}
                        <span className="text-xs text-muted-foreground"> · {personAnzahl.get(p.schluessel) ?? 0}×</span>
                      </span>
                      <Button size="icon-sm" variant="outline" aria-label={`${p.anzeige} als Verantwortliche`} disabled={busy || !position}
                        onClick={() => zuPosition(p.body)}><Plus /></Button>
                    </li>
                  ))}
              </ul>
              <form className="grid gap-2 border-t pt-2" onSubmit={async (e) => {
                e.preventDefault();
                const r = await dpApi<{ id: number }>("POST", "/externe-personen", { name: extern.name || null, organisation: extern.organisation || null });
                if (!r.ok) { alert(r.message); return; }
                setExtern({ name: "", organisation: "" });
                await katalogeLaden();
              }}>
                <p className="text-sm font-medium">Externe Person anlegen</p>
                <Input value={extern.name} onChange={(e) => setExtern({ ...extern, name: e.target.value })} placeholder="Name (optional)" aria-label="Name der externen Person" className="h-8" />
                <Input value={extern.organisation} onChange={(e) => setExtern({ ...extern, organisation: e.target.value })} placeholder="Organisation (z. B. DRK)" aria-label="Organisation" className="h-8" />
                <Button size="sm" type="submit" variant="outline" disabled={busy || (!extern.name.trim() && !extern.organisation.trim())}>Anlegen</Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

interface TerminWerte {
  datum: string; uhrzeit: string | null; kategorieId: number; dauerMinuten: number | null;
  ort: string | null; bemerkung: string | null; notizen: string | null; ausgefallen: boolean;
}

function TerminFormular({ schliessen, termin, jahr, kategorien, speichern }: {
  schliessen: () => void; termin: DpTermin | null; jahr: number; kategorien: DpKategorie[];
  speichern: (w: TerminWerte) => Promise<string | null>;
}) {
  // Startwerte beim Öffnen (die Komponente wird je Termin mit eigenem key neu angelegt)
  const [w, setW] = useState<TerminWerte>(() => termin ? {
    datum: termin.datum, uhrzeit: termin.uhrzeit, kategorieId: termin.kategorieId, dauerMinuten: termin.dauerMinuten,
    ort: termin.ort, bemerkung: termin.bemerkung, notizen: termin.notizen, ausgefallen: termin.ausgefallen,
  } : {
    datum: `${jahr}-01-01`, uhrzeit: null, kategorieId: kategorien[0]?.id ?? 0, dauerMinuten: null,
    ort: null, bemerkung: null, notizen: null, ausgefallen: false,
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open onOpenChange={(o) => !o && schliessen()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{termin ? `Termin ${datumKurz(termin.datum)}` : "Neuer Termin"}</SheetTitle>
          <SheetDescription>
            {termin?.quelle === "rhythmus" ? "Rhythmus-Termin: Verschieben ist möglich, er wird dann nicht neu erzeugt. Absagen statt löschen." : `Manueller Termin im Jahr ${jahr}.`}
          </SheetDescription>
        </SheetHeader>
        <form className="grid gap-4 px-4 pb-6" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = await speichern(w);
          setBusy(false);
          setFehler(f);
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="t-datum">Datum</Label>
              <Input id="t-datum" type="date" required min={`${jahr}-01-01`} max={`${jahr}-12-31`} value={w.datum} onChange={(e) => setW({ ...w, datum: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-zeit">Uhrzeit</Label>
              <Input id="t-zeit" type="time" value={w.uhrzeit ?? ""} onChange={(e) => setW({ ...w, uhrzeit: e.target.value || null })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-kat">Kategorie</Label>
            <Select value={String(w.kategorieId)} onValueChange={(v) => setW({ ...w, kategorieId: Number(v) })}>
              <SelectTrigger id="t-kat" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {kategorien.map((k) => <SelectItem key={k.id} value={String(k.id)}>{k.kuerzel} – {k.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-dauer">Dauer in Minuten (leer = Standard der Kategorie)</Label>
            <Input id="t-dauer" inputMode="numeric" value={w.dauerMinuten ?? ""} onChange={(e) => setW({ ...w, dauerMinuten: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-ort">Ort</Label>
            <Input id="t-ort" value={w.ort ?? ""} onChange={(e) => setW({ ...w, ort: e.target.value || null })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-bem">Bemerkung (erscheint in Exporten; bei Absage der Grund)</Label>
            <Input id="t-bem" value={w.bemerkung ?? ""} onChange={(e) => setW({ ...w, bemerkung: e.target.value || null })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-notiz">Notizen (Ablauf, Material; nur im Portal)</Label>
            <textarea id="t-notiz" className={textarea} value={w.notizen ?? ""} onChange={(e) => setW({ ...w, notizen: e.target.value || null })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={w.ausgefallen} onChange={(e) => setW({ ...w, ausgefallen: e.target.checked })} />
            Termin entfällt
          </label>
          {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>Speichern</Button>
            <Button type="button" variant="outline" onClick={schliessen}>Abbrechen</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
