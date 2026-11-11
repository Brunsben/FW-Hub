"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dpApi, speichereDatei, type DateiAntwort } from "@/components/dienstplan/api";
import { datumKurz } from "@/components/dienstplan/farben";
import { DruckLinks } from "@/components/dienstplan/druck-links";

type Profil = { id: number; name: string; nurFreigegeben: boolean };
type Loeschen = { terminId: number; datum: string; zeit: string | null; titel: string; grund: "entfallen" | "geaendert" };
type Ergebnis = DateiAntwort & { anzahl: number; loeschen?: Loeschen[]; modus?: string; vorherigerLauf?: string | null };
type Lauf = { id: number; format: "csv" | "ics"; profilId: number | null; modus: string; erstelltAm: string; anzahl: number };

const auswahl = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

// Exporte aus der Eingabemaske (Spec 9, Phase 10/11): CSV nach Profil (z. B.
// DIVERA) komplett oder nur Änderungen, .ics, Excel. Planer und Admin.
export function ExportPanel({ jahr, entwurf }: { jahr: number; entwurf: boolean }) {
  const [offen, setOffen] = useState(false);
  const [profile, setProfile] = useState<Profil[]>([]);
  const [laeufe, setLaeufe] = useState<Lauf[]>([]);
  const [profilId, setProfilId] = useState<string>("");
  const [modus, setModus] = useState<"komplett" | "aenderungen">("aenderungen");
  const [halbjahr, setHalbjahr] = useState<string>("");
  const [icsModus, setIcsModus] = useState<"komplett" | "aenderungen">("komplett");
  const [busy, setBusy] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [loeschliste, setLoeschliste] = useState<{ ziel: string; liste: Loeschen[] } | null>(null);

  const hole = useCallback(() => Promise.all([
    dpApi<{ profile: Profil[] }>("GET", "/export-profile"),
    dpApi<{ laeufe: Lauf[] }>("GET", `/plaene/${jahr}/export/laeufe`),
  ]), [jahr]);
  useEffect(() => {
    if (!offen) return;
    let aktiv = true;
    void hole().then(([p, l]) => {
      if (!aktiv) return;
      if (p.ok) { setProfile(p.data.profile); setProfilId((alt) => alt || String(p.data.profile[0]?.id ?? "")); }
      if (l.ok) setLaeufe(l.data.laeufe);
    });
    return () => { aktiv = false; };
  }, [offen, hole]);

  async function exportiere(art: "csv" | "ics" | "xlsx", body: Record<string, unknown>, ziel: string) {
    setBusy(art);
    setMeldung(null);
    setLoeschliste(null);
    const r = await dpApi<Ergebnis>("POST", `/plaene/${jahr}/export/${art}`, body);
    setBusy(null);
    if (!r.ok) { setMeldung({ ok: false, text: r.message }); return; }
    speichereDatei(r.data);
    const d = r.data;
    setMeldung({ ok: true, text: `${d.dateiname}: ${d.anzahl} Termin(e)${d.modus === "aenderungen" ? ` geändert oder neu seit ${d.vorherigerLauf ? zeit(d.vorherigerLauf) : "dem letzten Export"}` : ""}.` });
    if (d.loeschen?.length) setLoeschliste({ ziel, liste: d.loeschen });
    const [, l] = await hole();
    if (l.ok) setLaeufe(l.data.laeufe);
  }

  const profilName = (id: number | null) => profile.find((p) => p.id === id)?.name ?? "Profil";
  const gewaehlt = profile.find((p) => String(p.id) === profilId);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOffen(true)}><Download /> Export</Button>
      <Sheet open={offen} onOpenChange={setOffen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Export {jahr}</SheetTitle>
            <SheetDescription>Dateien für DIVERA, Google-Kalender, Excel, PDF und Smartphone. Ausgefallene Termine stehen nicht in der CSV.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 px-4 pb-6">
            <div className="grid gap-2">
              <Label htmlFor="ex-halbjahr">Zeitraum (CSV und iCal)</Label>
              <select id="ex-halbjahr" className={auswahl} value={halbjahr} onChange={(e) => setHalbjahr(e.target.value)}>
                <option value="">ganzes Jahr</option><option value="1">1. Halbjahr</option><option value="2">2. Halbjahr</option>
              </select>
            </div>

            <section className="grid gap-3" aria-labelledby="ex-csv">
              <h3 id="ex-csv" className="text-sm font-semibold">CSV nach Profil (z. B. DIVERA 24/7)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="ex-profil">Profil</Label>
                  <select id="ex-profil" className={auswahl} value={profilId} onChange={(e) => setProfilId(e.target.value)}>
                    {profile.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ex-modus">Umfang</Label>
                  <select id="ex-modus" className={auswahl} value={modus} onChange={(e) => setModus(e.target.value as typeof modus)}>
                    <option value="aenderungen">nur Änderungen</option><option value="komplett">komplett</option>
                  </select>
                </div>
              </div>
              {gewaehlt?.nurFreigegeben && entwurf && <p className="text-sm text-muted-foreground">Dieses Profil exportiert nur freigegebene Pläne.</p>}
              <Button disabled={!profilId} loading={busy === "csv"}
                onClick={() => void exportiere("csv", { profilId: Number(profilId), modus, ...(halbjahr ? { halbjahr: Number(halbjahr) } : {}) }, gewaehlt?.name ?? "Zielsystem")}>
                CSV erzeugen
              </Button>
              <p className="text-xs text-muted-foreground">„Nur Änderungen“ enthält neue und geänderte Termine seit dem letzten Export mit diesem Profil; beim ersten Mal alles.</p>
            </section>

            <section className="grid gap-3" aria-labelledby="ex-ics">
              <h3 id="ex-ics" className="text-sm font-semibold">Kalender (.ics) für den Google-Kalender</h3>
              <div className="grid gap-2">
                <Label htmlFor="ex-ics-modus">Umfang</Label>
                <select id="ex-ics-modus" className={auswahl} value={icsModus} onChange={(e) => setIcsModus(e.target.value as typeof icsModus)}>
                  <option value="komplett">komplett</option><option value="aenderungen">nur Änderungen</option>
                </select>
              </div>
              <Button variant="outline" loading={busy === "ics"}
                onClick={() => void exportiere("ics", { modus: icsModus, ...(halbjahr ? { halbjahr: Number(halbjahr) } : {}) }, "Google-Kalender")}>
                .ics erzeugen
              </Button>
              <p className="text-xs text-muted-foreground">Jeder Termin hat eine feste Kennung; ein erneuter Import aktualisiert ihn. Abgesagte Termine werden als „Entfällt“ übertragen.</p>
            </section>

            <section className="grid gap-3" aria-labelledby="ex-xlsx">
              <h3 id="ex-xlsx" className="text-sm font-semibold">Excel</h3>
              <Button variant="outline" loading={busy === "xlsx"} onClick={() => void exportiere("xlsx", {}, "")}>Excel erzeugen (Halbjahre und Gesamt)</Button>
            </section>

            <section className="grid gap-3" aria-labelledby="ex-druck">
              <h3 id="ex-druck" className="text-sm font-semibold">PDF und Bild fürs Handy</h3>
              <DruckLinks jahr={jahr} halbjahr={halbjahr} />
            </section>

            {meldung && <p role={meldung.ok ? "status" : "alert"} className="text-sm" data-testid="export-meldung">{meldung.text}</p>}
            {loeschliste && (
              <div className="grid gap-2 rounded-lg border border-warning p-3" data-testid="loeschliste">
                <p className="text-sm font-medium">In {loeschliste.ziel} von Hand löschen ({loeschliste.liste.length}):</p>
                <ul className="grid gap-1 text-sm">
                  {loeschliste.liste.map((l) => (
                    <li key={`${l.terminId}-${l.grund}`}>
                      {datumKurz(l.datum)} {l.zeit ?? ""} – {l.titel} <span className="text-muted-foreground">({l.grund === "entfallen" ? "entfallen" : "alte Fassung, neu exportiert"})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section className="grid gap-2" aria-labelledby="ex-laeufe">
              <h3 id="ex-laeufe" className="text-sm font-semibold">Letzte Exporte</h3>
              {laeufe.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine.</p> : (
                <ul className="grid gap-1 text-sm">
                  {laeufe.slice(0, 8).map((l) => (
                    <li key={l.id}>{zeit(l.erstelltAm)} · {l.format === "ics" ? "iCal" : profilName(l.profilId)} · {l.modus === "aenderungen" ? "Änderungen" : "komplett"} · {l.anzahl} Termine im Stand</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
