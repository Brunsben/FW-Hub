"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DpHinweis, DpTermin } from "@/lib/dienstplan/hinweise";
import type { DpKategorie, DpPlan } from "@/lib/dienstplan/plan";
import { ansichtAus, geaenderteTermine, halbjahrVon, monateDerAnsicht, type Ansicht, type Stand } from "@/lib/dienstplan/praesentation";
import { datumKurz, klassenFuer, MONATE } from "@/components/dienstplan/farben";

// Präsentationsansicht für den Fernseher (Spec 7.3). Nur Anzeige, keine
// Bedienelemente. Optimiert für 1920×1080 (skaliert bis 3840×2160).
// - Halbjahr als Standard (6 Monatsspalten); ?ansicht=h1|h2|jahr, dazu die
//   Tasten 1, 2 und J, falls eine Tastatur angeschlossen ist.
// - Polling alle 2 Sekunden mit If-None-Match; bei gleichem Stand 304 ohne Inhalt.
// - Geänderte Karten 3 Sekunden hervorgehoben, Fokus-Termin dauerhaft; liegt ein
//   neuer Fokus im anderen Halbjahr, wechselt die Ansicht dorthin.
// - Zugang: Anzeige-Token im Fragment (#t=…, Header X-Dienstplan-Anzeige) oder
//   die eigene Anmeldung (Planer sehen Entwürfe, Mitglieder nur Freigegebenes).

interface PlanDaten { plan: DpPlan; kategorien: DpKategorie[]; termine: DpTermin[]; hinweise: DpHinweis[]; gueltigBis?: string }

const POLL_MS = 2000;
const HERVORHEBEN_MS = 3000;
const SCHRIFT = { halbjahr: { start: 1.4, min: 0.6 }, jahr: { start: 0.8, min: 0.42 } }; // in vw

type Zustand =
  | { art: "laden" }
  | { art: "gesperrt"; text: string }
  | { art: "ok"; daten: PlanDaten };

export function Praesentation({ jahr, ansichtParam }: { jahr: number; ansichtParam: string | null }) {
  const [zustand, setZustand] = useState<Zustand>({ art: "laden" });
  const [ansicht, setAnsicht] = useState<Ansicht>(() => ansichtAus(ansichtParam, jahr, new Date().toISOString().slice(0, 10)));
  const [neu, setNeu] = useState<Set<number>>(new Set());
  const [verbindung, setVerbindung] = useState<{ ok: boolean; zeit: string }>({ ok: true, zeit: "" });
  const etag = useRef<string | null>(null);
  const stand = useRef<Stand[] | null>(null);
  const letzterFokus = useRef<number | null>(null);

  const abrufen = useCallback(async (): Promise<boolean> => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    const headers: Record<string, string> = {};
    if (token) headers["x-dienstplan-anzeige"] = token;
    if (etag.current) headers["if-none-match"] = etag.current;
    const zeit = new Date().toLocaleTimeString("de-DE");
    let res: Response;
    try {
      res = await fetch(token ? `/api/dienstplan/anzeige/${jahr}` : `/api/dienstplan/plaene/${jahr}`, { headers, cache: "no-store" });
    } catch {
      setVerbindung({ ok: false, zeit });
      return true;
    }
    if (res.status === 304) { setVerbindung({ ok: true, zeit }); return true; }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      const meldung = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setZustand({
        art: "gesperrt",
        text: token
          ? `${meldung ?? "Anzeige-Link ungültig"}. Bitte in der Eingabemaske einen neuen Anzeige-Link erzeugen.`
          : res.status === 401 ? "Nicht angemeldet. Bitte anmelden oder einen Anzeige-Link verwenden." : (meldung ?? "Kein Zugriff"),
      });
      return false;
    }
    if (!res.ok) { setVerbindung({ ok: false, zeit }); return true; }
    const daten = (await res.json()) as PlanDaten;
    etag.current = res.headers.get("etag");
    const jetzt = daten.termine.map((t) => ({ id: t.id, aktualisiertAm: t.aktualisiertAm }));
    const geaendert = geaenderteTermine(stand.current, jetzt);
    stand.current = jetzt;
    // Neuer Fokus im anderen Halbjahr: dorthin wechseln (Gesamtjahr bleibt).
    const fokus = daten.plan.fokusTerminId;
    if (fokus !== letzterFokus.current) {
      letzterFokus.current = fokus;
      const ft = daten.termine.find((t) => t.id === fokus);
      if (ft) setAnsicht((a) => (a === "jahr" ? a : halbjahrVon(ft.datum)));
    }
    setZustand({ art: "ok", daten });
    setVerbindung({ ok: true, zeit });
    if (geaendert.length) {
      setNeu((alt) => new Set([...alt, ...geaendert]));
      window.setTimeout(() => setNeu((alt) => new Set([...alt].filter((id) => !geaendert.includes(id)))), HERVORHEBEN_MS);
    }
    return true;
  }, [jahr]);

  // Polling: nächster Abruf erst nach dem vorherigen (keine Überholer).
  useEffect(() => {
    let aktiv = true;
    let timer: number | undefined;
    const schleife = async () => {
      const weiter = await abrufen();
      if (aktiv && weiter) timer = window.setTimeout(schleife, POLL_MS);
    };
    void schleife();
    return () => { aktiv = false; window.clearTimeout(timer); };
  }, [abrufen]);

  // Tasten 1, 2, J (ohne sichtbare Bedienelemente).
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const a = ({ "1": "h1", "2": "h2", j: "jahr", J: "jahr" } as Record<string, Ansicht>)[e.key];
      if (!a) return;
      setAnsicht(a);
      const url = new URL(window.location.href);
      url.searchParams.set("ansicht", a);
      window.history.replaceState(null, "", url);
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  if (zustand.art === "laden") return <Vollbild>Plan {jahr} wird geladen …</Vollbild>;
  if (zustand.art === "gesperrt") return <Vollbild><span role="alert">{zustand.text}</span></Vollbild>;
  return <Tafel daten={zustand.daten} ansicht={ansicht} neu={neu} verbindung={verbindung} />;
}

function Vollbild({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-dvh items-center justify-center bg-background p-[4vw] text-center text-foreground" style={{ fontSize: "clamp(18px, 1.6vw, 64px)" }}>
      <p className="max-w-[60ch]">{children}</p>
    </main>
  );
}

function Tafel({ daten, ansicht, neu, verbindung }: { daten: PlanDaten; ansicht: Ansicht; neu: Set<number>; verbindung: { ok: boolean; zeit: string } }) {
  const { plan, kategorien, termine, hinweise } = daten;
  const farben = new Map(kategorien.map((k) => [k.id, k.farbe]));
  const monate = monateDerAnsicht(ansicht);
  const ohneThema = hinweise.filter((h) => h.art === "ohne_thema").length;
  const pflicht = hinweise.filter((h) => h.art === "pflichtthema");
  const wurzel = useRef<HTMLElement>(null);
  const schrift = ansicht === "jahr" ? SCHRIFT.jahr : SCHRIFT.halbjahr;

  // Schrift so groß wie möglich: ab der Startgröße verkleinern, bis keine
  // Monatsspalte mehr überläuft (direkt am DOM, kein Render-Zyklus).
  useLayoutEffect(() => {
    const el = wurzel.current;
    if (!el) return;
    const spalten = () => [...el.querySelectorAll<HTMLElement>("[data-spalte]")];
    let vw = schrift.start;
    el.style.fontSize = `${vw}vw`;
    while (vw > schrift.min && spalten().some((s) => s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1)) {
      vw = Math.round((vw * 0.94) * 1000) / 1000;
      el.style.fontSize = `${vw}vw`;
    }
    if (plan.fokusTerminId) document.getElementById(`p-termin-${plan.fokusTerminId}`)?.scrollIntoView({ block: "nearest" });
  }, [daten, ansicht, schrift, plan.fokusTerminId]);

  const titel = ansicht === "jahr" ? `Dienstplan ${plan.jahr}` : `Dienstplan ${plan.jahr} · ${ansicht === "h1" ? "1." : "2."} Halbjahr`;
  return (
    <main ref={wurzel} className="flex h-dvh flex-col gap-[0.8em] overflow-hidden bg-background p-[1.2em] text-foreground">
      <header className="flex items-baseline justify-between gap-[1em]">
        <div className="flex items-baseline gap-[0.8em]">
          <h1 className="text-[1.9em] font-semibold tracking-tight">{titel}</h1>
          <span className={cn("rounded-full border px-[0.6em] text-[0.9em]", plan.status === "entwurf" ? "border-border text-muted-foreground" : "border-success text-success")}>
            {plan.status === "entwurf" ? "Entwurf" : "Freigegeben"}
          </span>
        </div>
        <div className="flex items-baseline gap-[1.2em] text-[0.95em]">
          <span>Dienstabende ohne Thema: <strong className="tabular-nums">{ohneThema}</strong></span>
          <span className={cn("text-[0.8em]", verbindung.ok ? "text-muted-foreground" : "font-semibold text-destructive")}>
            {verbindung.ok ? `Stand ${verbindung.zeit}` : `Verbindung unterbrochen (${verbindung.zeit})`}
          </span>
        </div>
      </header>
      {pflicht.length > 0 && (
        <p className="rounded-md border border-warning px-[0.6em] py-[0.2em] text-[0.9em]">
          {pflicht.map((h) => h.text).join(" · ")}
        </p>
      )}
      <div className="grid min-h-0 flex-1 gap-[0.6em]" style={{ gridTemplateColumns: `repeat(${monate.length}, minmax(0, 1fr))` }}>
        {monate.map((m) => (
          <section key={m} className="flex min-h-0 flex-col gap-[0.4em]">
            <h2 className="border-b border-border pb-[0.1em] text-[1.15em] font-semibold">{MONATE[m]}</h2>
            <div data-spalte className="flex min-h-0 flex-1 flex-col gap-[0.4em] overflow-hidden">
              {termine.filter((t) => Number(t.datum.slice(5, 7)) - 1 === m).map((t) => (
                <Karte key={t.id} t={t} farbe={farben.get(t.kategorieId)} fokus={t.id === plan.fokusTerminId} neu={neu.has(t.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function Karte({ t, farbe, fokus, neu }: { t: DpTermin; farbe: string | undefined; fokus: boolean; neu: boolean }) {
  const k = klassenFuer(farbe, t.ausgefallen);
  return (
    <article
      id={`p-termin-${t.id}`}
      data-fokus={fokus || undefined}
      data-neu={neu || undefined}
      className={cn(
        "shrink-0 rounded-[0.4em] border-l-[0.3em] px-[0.5em] py-[0.3em] transition-shadow duration-500",
        k.streifen, k.flaeche,
        t.ausgefallen && "text-muted-foreground",
        neu && "ring-[0.2em] ring-warning",
        fokus && "ring-[0.25em] ring-primary",
      )}
    >
      <div className="flex items-baseline justify-between gap-[0.4em] whitespace-nowrap">
        <span className="font-semibold tabular-nums">{datumKurz(t.datum)}</span>
        <span className="flex items-baseline gap-[0.4em] text-[0.85em]">
          {t.uhrzeit && <span className="tabular-nums text-muted-foreground">{t.uhrzeit}</span>}
          <span className="font-bold">{t.kuerzel}</span>
        </span>
      </div>
      {t.feiertag && <p className="text-[0.8em] text-warning">{t.feiertag}</p>}
      {t.ausgefallen ? (
        <p className="text-[0.85em]">entfällt{t.bemerkung ? `: ${t.bemerkung}` : ""}</p>
      ) : (
        <>
          {t.themen.map((th) => (
            <p key={th.id} className="hyphens-auto leading-snug [overflow-wrap:anywhere]">
              <span className="font-medium">{th.titel}</span>
              {th.verantwortliche.length > 0 && (
                <span className="text-[0.85em] text-muted-foreground"> · {th.verantwortliche.map((v) => v.name).join(", ")}</span>
              )}
            </p>
          ))}
          {t.bemerkung && <p className="text-[0.8em] text-muted-foreground">{t.bemerkung}</p>}
        </>
      )}
    </article>
  );
}
