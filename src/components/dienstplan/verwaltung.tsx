"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { dpApi } from "@/components/dienstplan/api";
import { datumKurz, KATEGORIE_KLASSEN } from "@/components/dienstplan/farben";

// Verwaltung (Spec 7.5). Kategorien und Rhythmusregeln ändert nur der
// Dienstplan-Admin (Planer sehen sie lesend), Themen, Bereiche, Blöcke und
// externe Personen pflegen Planer und Admin. Die Rechte erzwingt die API/RLS.

const FARBEN = Object.keys(KATEGORIE_KLASSEN);
const WOCHENTAGE = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const selectKlasse = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/80";
const textareaKlasse = "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/80";
const leerZuNull = (s: string) => (s.trim() ? s.trim() : null);

function useListe<T>(pfad: string, feld: string) {
  const [liste, setListe] = useState<T[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const hole = useCallback(async () => {
    const r = await dpApi<Record<string, T[]>>("GET", pfad);
    return r.ok ? { liste: r.data[feld], fehler: null } : { liste: null, fehler: r.message };
  }, [pfad, feld]);
  const neu = useCallback(async () => { const e = await hole(); setListe(e.liste); setFehler(e.fehler); }, [hole]);
  useEffect(() => {
    let aktiv = true;
    void hole().then((e) => { if (aktiv) { setListe(e.liste); setFehler(e.fehler); } });
    return () => { aktiv = false; };
  }, [hole]);
  return { liste, fehler, neu };
}

function Abschnitt({ titel, beschreibung, aktion, children }: { titel: string; beschreibung?: string; aktion?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{titel}</CardTitle>
          {beschreibung && <CardDescription>{beschreibung}</CardDescription>}
        </div>
        {aktion}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Formular im Seitenpanel; wird je Öffnen neu angelegt (Startwerte im useState). */
function FormSheet({ titel, beschreibung, schliessen, absenden, children }: {
  titel: string; beschreibung?: string; schliessen: () => void; absenden: () => Promise<string | null>; children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <Sheet open onOpenChange={(o) => !o && schliessen()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{titel}</SheetTitle>
          {beschreibung && <SheetDescription>{beschreibung}</SheetDescription>}
        </SheetHeader>
        <form className="grid gap-4 px-4 pb-6" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = await absenden();
          setBusy(false);
          if (f) setFehler(f); else schliessen();
        }}>
          {children}
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

function Feld({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function Haken({ label, wert, setze }: { label: string; wert: boolean; setze: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wert} onChange={(e) => setze(e.target.checked)} />{label}</label>;
}

const speichere = async (pfad: string, id: number | null, body: unknown, danach: () => Promise<void>) => {
  const r = await dpApi(id ? "PATCH" : "POST", id ? `${pfad}/${id}` : pfad, body);
  if (r.ok) await danach();
  return r.ok ? null : r.message;
};

export function Verwaltung({ istAdmin }: { istAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <Kategorien istAdmin={istAdmin} />
      <Regeln istAdmin={istAdmin} />
      <Themen />
      <Ausgleich istAdmin={istAdmin} />
      <Bloecke />
      <ExternePersonen />
      <ExportProfile istAdmin={istAdmin} />
      {istAdmin && <IcalAbo />}
    </div>
  );
}

// ── Kategorien ──────────────────────────────────────────────────────────────

interface Kategorie { id: number; kuerzel: string; name: string; farbe: string; standardUhrzeit: string | null; standardDauerMinuten: number; sortierung: number; aktiv: boolean }

function Kategorien({ istAdmin }: { istAdmin: boolean }) {
  const { liste, fehler, neu } = useListe<Kategorie>("/kategorien", "kategorien");
  const [form, setForm] = useState<Kategorie | "neu" | null>(null);
  return (
    <Abschnitt titel="Kategorien" beschreibung={istAdmin ? "Kürzel, Name, Farbe und Standardzeit. Nicht löschen, sondern deaktivieren." : "Ändern darf der Dienstplan-Admin."}
      aktion={istAdmin && <Button size="sm" onClick={() => setForm("neu")}><Plus /> Kategorie</Button>}>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      <Table>
        <TableHeader><TableRow><TableHead>Kürzel</TableHead><TableHead>Name</TableHead><TableHead>Farbe</TableHead><TableHead>Uhrzeit</TableHead><TableHead>Dauer</TableHead><TableHead>Status</TableHead>{istAdmin && <TableHead />}</TableRow></TableHeader>
        <TableBody>
          {(liste ?? []).map((k) => (
            <TableRow key={k.id}>
              <TableCell className="font-semibold">{k.kuerzel}</TableCell>
              <TableCell>{k.name}</TableCell>
              <TableCell><span className="inline-flex items-center gap-2"><span aria-hidden className={cn("size-3 rounded-full", KATEGORIE_KLASSEN[k.farbe]?.punkt)} />{k.farbe}</span></TableCell>
              <TableCell className="tabular-nums">{k.standardUhrzeit ?? "–"}</TableCell>
              <TableCell className="tabular-nums">{k.standardDauerMinuten} min</TableCell>
              <TableCell>{k.aktiv ? "aktiv" : <span className="text-muted-foreground">inaktiv</span>}</TableCell>
              {istAdmin && <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setForm(k)}>Bearbeiten</Button></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {form && <KategorieForm k={form === "neu" ? null : form} schliessen={() => setForm(null)} danach={neu} />}
    </Abschnitt>
  );
}

function KategorieForm({ k, schliessen, danach }: { k: Kategorie | null; schliessen: () => void; danach: () => Promise<void> }) {
  const [w, setW] = useState({
    kuerzel: k?.kuerzel ?? "", name: k?.name ?? "", farbe: k?.farbe ?? "blue", standardUhrzeit: k?.standardUhrzeit ?? "",
    standardDauerMinuten: String(k?.standardDauerMinuten ?? 120), sortierung: String(k?.sortierung ?? 0), aktiv: k?.aktiv ?? true,
  });
  return (
    <FormSheet titel={k ? `Kategorie ${k.kuerzel}` : "Neue Kategorie"} schliessen={schliessen}
      absenden={() => speichere("/kategorien", k?.id ?? null, {
        kuerzel: w.kuerzel, name: w.name, farbe: w.farbe, standardUhrzeit: leerZuNull(w.standardUhrzeit),
        standardDauerMinuten: Number(w.standardDauerMinuten), sortierung: Number(w.sortierung), aktiv: w.aktiv,
      }, danach)}>
      <Feld id="k-kuerzel" label="Kürzel (1–3 Buchstaben)"><Input id="k-kuerzel" value={w.kuerzel} onChange={(e) => setW({ ...w, kuerzel: e.target.value })} /></Feld>
      <Feld id="k-name" label="Name"><Input id="k-name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Feld>
      <Feld id="k-farbe" label="Farbe">
        <select id="k-farbe" className={selectKlasse} value={w.farbe} onChange={(e) => setW({ ...w, farbe: e.target.value })}>
          {FARBEN.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Feld>
      <Feld id="k-zeit" label="Standarduhrzeit (leer = ohne)"><Input id="k-zeit" type="time" value={w.standardUhrzeit} onChange={(e) => setW({ ...w, standardUhrzeit: e.target.value })} /></Feld>
      <Feld id="k-dauer" label="Standarddauer (Minuten)"><Input id="k-dauer" inputMode="numeric" value={w.standardDauerMinuten} onChange={(e) => setW({ ...w, standardDauerMinuten: e.target.value })} /></Feld>
      <Feld id="k-sort" label="Sortierung"><Input id="k-sort" inputMode="numeric" value={w.sortierung} onChange={(e) => setW({ ...w, sortierung: e.target.value })} /></Feld>
      <Haken label="aktiv" wert={w.aktiv} setze={(v) => setW({ ...w, aktiv: v })} />
    </FormSheet>
  );
}

// ── Rhythmusregeln ──────────────────────────────────────────────────────────

interface Regel {
  id: number; name: string; typ: "wochen_zyklus" | "monats_wochentag"; wochentag: number; uhrzeit: string;
  ankerDatum: string | null; muster: string[] | null; nterWochentag: number | null; monate: number[] | null;
  kategorieKuerzel: string | null; gueltigAb: string; gueltigBis: string | null; aktiv: boolean;
}

const regelText = (r: Regel) => r.typ === "wochen_zyklus"
  ? `${WOCHENTAGE[r.wochentag]} ${r.uhrzeit}, Muster ${(r.muster ?? []).map((m) => m || "–").join(" ")} ab Anker ${r.ankerDatum ?? "?"}`
  : `${r.nterWochentag === -1 ? "letzter" : `${r.nterWochentag}.`} ${WOCHENTAGE[r.wochentag]} ${r.uhrzeit} in Monat ${(r.monate ?? []).join(", ")} → ${r.kategorieKuerzel}`;

function Regeln({ istAdmin }: { istAdmin: boolean }) {
  const { liste, fehler, neu } = useListe<Regel>("/regeln", "regeln");
  const [form, setForm] = useState<Regel | "neu" | null>(null);
  const [vorschau, setVorschau] = useState<{ id: number; treffer: { datum: string; kuerzel: string; uhrzeit: string; feiertag: string | null }[] } | null>(null);
  return (
    <Abschnitt titel="Rhythmusregeln" beschreibung="Grundlage des Generators. Ein Wechsel (z. B. Zwischendienst versetzen) gilt über „gültig ab/bis“; beim Anlegen eines Jahres geht das auch direkt."
      aktion={istAdmin && <Button size="sm" onClick={() => setForm("neu")}><Plus /> Regel</Button>}>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      <ul className="grid gap-3">
        {(liste ?? []).map((r) => (
          <li key={r.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{r.name} {!r.aktiv && <Badge variant="outline">inaktiv</Badge>}</p>
                <p className="text-sm text-muted-foreground">{regelText(r)}</p>
                <p className="text-sm text-muted-foreground">gültig {r.gueltigAb}{r.gueltigBis ? ` bis ${r.gueltigBis}` : " ohne Ende"}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={async () => {
                  if (vorschau?.id === r.id) { setVorschau(null); return; }
                  const v = await dpApi<{ treffer: { datum: string; kuerzel: string; uhrzeit: string; feiertag: string | null }[] }>("GET", `/regeln/${r.id}/vorschau?anzahl=12`);
                  if (v.ok) setVorschau({ id: r.id, treffer: v.data.treffer });
                }}>{vorschau?.id === r.id ? "Vorschau schließen" : "Nächste 12"}</Button>
                {istAdmin && <Button size="sm" variant="outline" onClick={() => setForm(r)}>Bearbeiten</Button>}
              </div>
            </div>
            {vorschau?.id === r.id && (
              <p className="mt-2 text-sm">
                {vorschau.treffer.length ? vorschau.treffer.map((t) => `${datumKurz(t.datum)}${t.datum.slice(2, 4)} ${t.kuerzel}${t.feiertag ? ` (${t.feiertag})` : ""}`).join(" · ") : "Keine Treffer ab heute (Gültigkeit?)"}
              </p>
            )}
          </li>
        ))}
      </ul>
      {form && <RegelForm r={form === "neu" ? null : form} schliessen={() => setForm(null)} danach={neu} />}
    </Abschnitt>
  );
}

function RegelForm({ r, schliessen, danach }: { r: Regel | null; schliessen: () => void; danach: () => Promise<void> }) {
  const [w, setW] = useState({
    name: r?.name ?? "", typ: r?.typ ?? "wochen_zyklus", wochentag: String(r?.wochentag ?? 2), uhrzeit: r?.uhrzeit ?? "19:30",
    ankerDatum: r?.ankerDatum ?? "", muster: (r?.muster ?? ["D", "", "D", "Z"]).join(","), nterWochentag: String(r?.nterWochentag ?? 3),
    monate: (r?.monate ?? []).join(","), kategorieKuerzel: r?.kategorieKuerzel ?? "", gueltigAb: r?.gueltigAb ?? "", gueltigBis: r?.gueltigBis ?? "",
    aktiv: r?.aktiv ?? true,
  });
  const zyklus = w.typ === "wochen_zyklus";
  return (
    <FormSheet titel={r ? `Regel „${r.name}“` : "Neue Regel"} schliessen={schliessen}
      beschreibung="Bestehende Termine bleiben unverändert. Der Generator nutzt die Regel beim nächsten Lauf."
      absenden={() => speichere("/regeln", r?.id ?? null, {
        name: w.name, typ: w.typ, wochentag: Number(w.wochentag), uhrzeit: w.uhrzeit,
        ankerDatum: zyklus ? leerZuNull(w.ankerDatum) : null,
        muster: zyklus ? w.muster.split(",").map((m) => m.trim()) : null,
        nterWochentag: zyklus ? null : Number(w.nterWochentag),
        monate: zyklus ? null : w.monate.split(",").map((m) => Number(m.trim())).filter((m) => m),
        kategorieKuerzel: zyklus ? null : leerZuNull(w.kategorieKuerzel),
        gueltigAb: w.gueltigAb, gueltigBis: leerZuNull(w.gueltigBis), aktiv: w.aktiv,
      }, danach)}>
      <Feld id="r-name" label="Name"><Input id="r-name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Feld>
      <Feld id="r-typ" label="Typ">
        <select id="r-typ" className={selectKlasse} value={w.typ} onChange={(e) => setW({ ...w, typ: e.target.value as Regel["typ"] })}>
          <option value="wochen_zyklus">Wochen-Zyklus (z. B. D, frei, D, Z)</option>
          <option value="monats_wochentag">n-ter Wochentag im Monat</option>
        </select>
      </Feld>
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld id="r-wt" label="Wochentag">
          <select id="r-wt" className={selectKlasse} value={w.wochentag} onChange={(e) => setW({ ...w, wochentag: e.target.value })}>
            {WOCHENTAGE.slice(1).map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </Feld>
        <Feld id="r-zeit" label="Uhrzeit"><Input id="r-zeit" type="time" value={w.uhrzeit} onChange={(e) => setW({ ...w, uhrzeit: e.target.value })} /></Feld>
      </div>
      {zyklus ? (
        <>
          <Feld id="r-anker" label="Ankerdatum (Woche mit Musterindex 0)"><Input id="r-anker" type="date" value={w.ankerDatum} onChange={(e) => setW({ ...w, ankerDatum: e.target.value })} /></Feld>
          <Feld id="r-muster" label="Muster je Woche, mit Komma getrennt, leer = frei (z. B. D,,D,Z)"><Input id="r-muster" value={w.muster} onChange={(e) => setW({ ...w, muster: e.target.value })} /></Feld>
        </>
      ) : (
        <>
          <Feld id="r-nter" label="Welcher Wochentag im Monat">
            <select id="r-nter" className={selectKlasse} value={w.nterWochentag} onChange={(e) => setW({ ...w, nterWochentag: e.target.value })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}.</option>)}
              <option value={-1}>letzter</option>
            </select>
          </Feld>
          <Feld id="r-monate" label="Monate, mit Komma getrennt (z. B. 2,5,8,11)"><Input id="r-monate" value={w.monate} onChange={(e) => setW({ ...w, monate: e.target.value })} /></Feld>
          <Feld id="r-kat" label="Kategorie-Kürzel"><Input id="r-kat" value={w.kategorieKuerzel} onChange={(e) => setW({ ...w, kategorieKuerzel: e.target.value })} /></Feld>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld id="r-ab" label="gültig ab"><Input id="r-ab" type="date" value={w.gueltigAb} onChange={(e) => setW({ ...w, gueltigAb: e.target.value })} /></Feld>
        <Feld id="r-bis" label="gültig bis (leer = ohne Ende)"><Input id="r-bis" type="date" value={w.gueltigBis} onChange={(e) => setW({ ...w, gueltigBis: e.target.value })} /></Feld>
      </div>
      <Haken label="aktiv" wert={w.aktiv} setze={(v) => setW({ ...w, aktiv: v })} />
    </FormSheet>
  );
}

// ── Themen und Bereiche ─────────────────────────────────────────────────────

interface Thema { id: number; titel: string; kurztitel: string | null; bereichId: number | null; notizen: string | null; pflichtJaehrlich: boolean; zielgruppe: string | null; aktiv: boolean; zuletzt: string | null }
interface Bereich { id: number; name: string; sortierung: number }

function Themen() {
  const { liste, fehler, neu } = useListe<Thema>("/themen", "themen");
  const bereiche = useListe<Bereich>("/bereiche", "bereiche");
  const [form, setForm] = useState<Thema | "neu" | null>(null);
  const [suche, setSuche] = useState("");
  const [neuerBereich, setNeuerBereich] = useState("");
  const bName = new Map((bereiche.liste ?? []).map((b) => [b.id, b.name]));
  const gefiltert = (liste ?? []).filter((t) => t.titel.toLocaleLowerCase("de-DE").includes(suche.trim().toLocaleLowerCase("de-DE")));
  const pflicht = (liste ?? []).filter((t) => t.pflichtJaehrlich && t.aktiv);
  const [pflichtMeldung, setPflichtMeldung] = useState<string | null>(null);
  return (
    <Abschnitt titel="Themenkatalog" beschreibung="Themen werden nicht gelöscht (sie hängen an alten Plänen), sondern deaktiviert."
      aktion={<Button size="sm" onClick={() => setForm("neu")}><Plus /> Thema</Button>}>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      <div className="mb-4 grid gap-2 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">Pflichtthemen (jedes Jahr einplanen, sonst Hinweis in Eingabe und Präsentation)</p>
        <p className="text-sm text-muted-foreground">
          {pflicht.length ? pflicht.map((t) => `${t.titel}${t.zielgruppe ? ` (${t.zielgruppe})` : ""}`).join(" · ") : "Noch keine Pflichtthemen festgelegt."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={async () => {
            const r = await dpApi<{ themen: { titel: string; neu: boolean }[] }>("POST", "/themen/pflicht-vorschlag");
            setPflichtMeldung(r.ok ? `Markiert: ${r.data.themen.map((t) => `${t.titel}${t.neu ? " (neu angelegt)" : ""}`).join(", ")}` : r.message);
            await neu();
          }}>Vorschlag übernehmen</Button>
          <span className="text-xs text-muted-foreground">Sicherheitsunterweisung, Erste Hilfe, Atemschutzunterweisung (Atemschutzgeräteträger). Weitere über „Bearbeiten“.</span>
        </div>
        {pflichtMeldung && <p role="status" className="text-sm">{pflichtMeldung}</p>}
      </div>
      <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Themen suchen" aria-label="Themen suchen" className="mb-3 max-w-sm" />
      <Table>
        <TableHeader><TableRow><TableHead>Titel</TableHead><TableHead>Bereich</TableHead><TableHead>Pflicht</TableHead><TableHead>Zuletzt</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {gefiltert.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Keine Themen.</TableCell></TableRow>}
          {gefiltert.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.titel}{t.kurztitel && <span className="text-muted-foreground"> ({t.kurztitel})</span>}</TableCell>
              <TableCell>{t.bereichId ? bName.get(t.bereichId) : "–"}</TableCell>
              <TableCell>{t.pflichtJaehrlich ? `ja${t.zielgruppe ? `, ${t.zielgruppe}` : ""}` : "–"}</TableCell>
              <TableCell className="tabular-nums">{t.zuletzt ?? "–"}</TableCell>
              <TableCell>{t.aktiv ? "aktiv" : <span className="text-muted-foreground">inaktiv</span>}</TableCell>
              <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setForm(t)}>Bearbeiten</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 grid gap-2">
        <p className="text-sm font-medium">Bereiche</p>
        <p className="text-sm text-muted-foreground">{(bereiche.liste ?? []).map((b) => b.name).join(" · ") || "Noch keine Bereiche."}</p>
        <form className="flex max-w-sm gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await dpApi("POST", "/bereiche", { name: neuerBereich });
          if (!r.ok) { alert(r.message); return; }
          setNeuerBereich("");
          await bereiche.neu();
        }}>
          <Input value={neuerBereich} onChange={(e) => setNeuerBereich(e.target.value)} placeholder="Neuer Bereich" aria-label="Neuer Bereich" />
          <Button type="submit" variant="outline" disabled={!neuerBereich.trim()}>Anlegen</Button>
        </form>
      </div>
      {form && <ThemaForm t={form === "neu" ? null : form} bereiche={bereiche.liste ?? []} schliessen={() => setForm(null)} danach={neu} />}
    </Abschnitt>
  );
}

function ThemaForm({ t, bereiche, schliessen, danach }: { t: Thema | null; bereiche: Bereich[]; schliessen: () => void; danach: () => Promise<void> }) {
  const [w, setW] = useState({
    titel: t?.titel ?? "", kurztitel: t?.kurztitel ?? "", bereichId: t?.bereichId ? String(t.bereichId) : "",
    pflichtJaehrlich: t?.pflichtJaehrlich ?? false, zielgruppe: t?.zielgruppe ?? "", notizen: t?.notizen ?? "", aktiv: t?.aktiv ?? true,
  });
  return (
    <FormSheet titel={t ? "Thema bearbeiten" : "Neues Thema"} schliessen={schliessen}
      absenden={() => speichere("/themen", t?.id ?? null, {
        titel: w.titel, kurztitel: leerZuNull(w.kurztitel), bereichId: w.bereichId ? Number(w.bereichId) : null,
        pflichtJaehrlich: w.pflichtJaehrlich, zielgruppe: leerZuNull(w.zielgruppe), notizen: leerZuNull(w.notizen), aktiv: w.aktiv,
      }, danach)}>
      <Feld id="th-titel" label="Titel"><Input id="th-titel" value={w.titel} onChange={(e) => setW({ ...w, titel: e.target.value })} /></Feld>
      <Feld id="th-kurz" label="Kurztitel (für enge Darstellungen)"><Input id="th-kurz" value={w.kurztitel} onChange={(e) => setW({ ...w, kurztitel: e.target.value })} /></Feld>
      <Feld id="th-bereich" label="Bereich">
        <select id="th-bereich" className={selectKlasse} value={w.bereichId} onChange={(e) => setW({ ...w, bereichId: e.target.value })}>
          <option value="">– ohne –</option>
          {bereiche.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Feld>
      <Haken label="Pflichtthema (jedes Jahr einplanen)" wert={w.pflichtJaehrlich} setze={(v) => setW({ ...w, pflichtJaehrlich: v })} />
      <Feld id="th-ziel" label="Zielgruppe (leer = alle)"><Input id="th-ziel" value={w.zielgruppe} onChange={(e) => setW({ ...w, zielgruppe: e.target.value })} /></Feld>
      <Feld id="th-notiz" label="Notizen (Inhalte, Material)"><textarea id="th-notiz" className={textareaKlasse} value={w.notizen} onChange={(e) => setW({ ...w, notizen: e.target.value })} /></Feld>
      <Haken label="aktiv" wert={w.aktiv} setze={(v) => setW({ ...w, aktiv: v })} />
    </FormSheet>
  );
}

// ── Ausgleich ───────────────────────────────────────────────────────────────

interface AusgleichPerson { kameradId: number; name: string; aktiv: boolean }
interface Person { id: number; anzeige: string }

function Ausgleich({ istAdmin }: { istAdmin: boolean }) {
  const { liste, fehler, neu } = useListe<AusgleichPerson>("/ausgleich", "personen");
  const personen = useListe<Person>("/personen", "kameraden");
  const [auswahl, setAuswahl] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const drin = new Set((liste ?? []).map((p) => p.kameradId));
  return (
    <Abschnitt titel="Ausgleich (Gruppenführer)"
      beschreibung="Wer hier steht, erscheint in der Eingabemaske im Reiter „Ausgleich“ mit der Zahl seiner Einteilungen. Kameradschaft (K) und Gremien (G, O) zählen nicht. Pflegen darf nur der Dienstplan-Admin.">
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      <ul className="mb-3 flex flex-wrap gap-2">
        {(liste ?? []).map((p) => (
          <li key={p.kameradId} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
            {p.name}{!p.aktiv && <span className="text-muted-foreground"> (inaktiv)</span>}
            {istAdmin && (
              <button type="button" aria-label={`${p.name} aus der Ausgleichsliste nehmen`} className="rounded-full hover:bg-accent"
                onClick={async () => { const r = await dpApi("DELETE", `/ausgleich/${p.kameradId}`); setMeldung(r.ok ? null : r.message); await neu(); }}>
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
        {liste && !liste.length && <li className="text-sm text-muted-foreground">Noch niemand in der Liste.</li>}
      </ul>
      {istAdmin && (
        <form className="flex max-w-md gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await dpApi("POST", "/ausgleich", { kameradId: Number(auswahl) });
          setMeldung(r.ok ? null : r.message);
          setAuswahl("");
          await neu();
        }}>
          <select aria-label="Kamerad für die Ausgleichsliste" className={selectKlasse} value={auswahl} onChange={(e) => setAuswahl(e.target.value)}>
            <option value="">Kamerad wählen …</option>
            {(personen.liste ?? []).filter((p) => !drin.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.anzeige}</option>)}
          </select>
          <Button type="submit" variant="outline" disabled={!auswahl}>Aufnehmen</Button>
        </form>
      )}
      {meldung && <p role="alert" className="mt-2 text-sm text-destructive">{meldung}</p>}
    </Abschnitt>
  );
}

// ── Blöcke ──────────────────────────────────────────────────────────────────

interface Block { id: number; name: string; aktiv: boolean; themen: { themaId: number; titel: string }[] }

function Bloecke() {
  const { liste, fehler, neu } = useListe<Block>("/bloecke", "bloecke");
  const themen = useListe<Thema>("/themen", "themen");
  const [form, setForm] = useState<Block | "neu" | null>(null);
  return (
    <Abschnitt titel="Themenblöcke" beschreibung="Themen, die gemeinsam eingeplant werden. Ein benutzter Block wird deaktiviert statt gelöscht."
      aktion={<Button size="sm" onClick={() => setForm("neu")}><Plus /> Block</Button>}>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      <ul className="grid gap-2">
        {(liste ?? []).length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Keine Blöcke.</li>}
        {(liste ?? []).map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <p className="font-medium">{b.name} {!b.aktiv && <Badge variant="outline">inaktiv</Badge>}</p>
              <p className="text-sm text-muted-foreground">{b.themen.map((t) => t.titel).join(" · ")}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setForm(b)}>Bearbeiten</Button>
              <Button size="sm" variant="outline" onClick={async () => {
                if (!confirm(`Block „${b.name}“ löschen?`)) return;
                const r = await dpApi("DELETE", `/bloecke/${b.id}`);
                if (!r.ok) alert(r.message); else await neu();
              }}>Löschen</Button>
            </div>
          </li>
        ))}
      </ul>
      {form && <BlockForm b={form === "neu" ? null : form} themen={(themen.liste ?? []).filter((t) => t.aktiv)} schliessen={() => setForm(null)} danach={neu} />}
    </Abschnitt>
  );
}

function BlockForm({ b, themen, schliessen, danach }: { b: Block | null; themen: Thema[]; schliessen: () => void; danach: () => Promise<void> }) {
  const [name, setName] = useState(b?.name ?? "");
  const [aktiv, setAktiv] = useState(b?.aktiv ?? true);
  const [ids, setIds] = useState<number[]>(b?.themen.map((t) => t.themaId) ?? []);
  const [auswahl, setAuswahl] = useState("");
  const titel = new Map([...themen.map((t) => [t.id, t.titel] as const), ...(b?.themen ?? []).map((t) => [t.themaId, t.titel] as const)]);
  const tausche = (i: number, j: number) => setIds((alt) => { const n = [...alt]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return (
    <FormSheet titel={b ? `Block „${b.name}“` : "Neuer Block"} schliessen={schliessen}
      beschreibung="Reihenfolge = Reihenfolge im Termin. Termine, die den Block schon nutzen, bleiben unverändert."
      absenden={() => speichere("/bloecke", b?.id ?? null, { name, aktiv, themaIds: ids }, danach)}>
      <Feld id="b-name" label="Name"><Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} /></Feld>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Themen ({ids.length})</p>
        <ol className="grid gap-1">
          {ids.map((id, i) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm">
              <span>{i + 1}. {titel.get(id) ?? `Thema ${id}`}</span>
              <span className="flex gap-0.5">
                <Button type="button" size="icon-xs" variant="ghost" aria-label="Nach oben" disabled={i === 0} onClick={() => tausche(i, i - 1)}><ArrowUp /></Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label="Nach unten" disabled={i === ids.length - 1} onClick={() => tausche(i, i + 1)}><ArrowDown /></Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label="Entfernen" onClick={() => setIds(ids.filter((x) => x !== id))}><X /></Button>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <select aria-label="Thema hinzufügen" className={selectKlasse} value={auswahl} onChange={(e) => setAuswahl(e.target.value)}>
            <option value="">Thema hinzufügen …</option>
            {themen.filter((t) => !ids.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.titel}</option>)}
          </select>
          <Button type="button" variant="outline" disabled={!auswahl} onClick={() => { setIds([...ids, Number(auswahl)]); setAuswahl(""); }}>Hinzufügen</Button>
        </div>
      </div>
      <Haken label="aktiv" wert={aktiv} setze={setAktiv} />
    </FormSheet>
  );
}

// ── Externe Personen ────────────────────────────────────────────────────────

interface Extern { id: number; name: string | null; organisation: string | null; funktion: string | null; email?: string | null; aktiv: boolean; anzeige: string }

function ExternePersonen() {
  const { liste, fehler, neu } = useListe<Extern>("/externe-personen", "personen");
  const [form, setForm] = useState<Extern | "neu" | null>(null);
  return (
    <Abschnitt titel="Externe Personen und Organisationen" beschreibung="Verantwortliche außerhalb der Wehr (z. B. DRK, Nachbarwehr). Nicht löschen, sondern deaktivieren."
      aktion={<Button size="sm" onClick={() => setForm("neu")}><Plus /> Externe Person</Button>}>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      <Table>
        <TableHeader><TableRow><TableHead>Anzeige</TableHead><TableHead>Funktion</TableHead><TableHead>E-Mail</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(liste ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Keine externen Personen.</TableCell></TableRow>}
          {(liste ?? []).map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.anzeige}</TableCell>
              <TableCell>{p.funktion ?? "–"}</TableCell>
              <TableCell>{p.email ?? "–"}</TableCell>
              <TableCell>{p.aktiv ? "aktiv" : <span className="text-muted-foreground">inaktiv</span>}</TableCell>
              <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setForm(p)}>Bearbeiten</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {form && <ExternForm p={form === "neu" ? null : form} schliessen={() => setForm(null)} danach={neu} />}
    </Abschnitt>
  );
}

function ExternForm({ p, schliessen, danach }: { p: Extern | null; schliessen: () => void; danach: () => Promise<void> }) {
  const [w, setW] = useState({ name: p?.name ?? "", organisation: p?.organisation ?? "", funktion: p?.funktion ?? "", email: p?.email ?? "", aktiv: p?.aktiv ?? true });
  return (
    <FormSheet titel={p ? "Externe Person bearbeiten" : "Neue externe Person"} schliessen={schliessen} beschreibung="Name oder Organisation ist Pflicht."
      absenden={() => speichere("/externe-personen", p?.id ?? null, {
        name: leerZuNull(w.name), organisation: leerZuNull(w.organisation), funktion: leerZuNull(w.funktion), email: leerZuNull(w.email), aktiv: w.aktiv,
      }, danach)}>
      <Feld id="e-name" label="Name"><Input id="e-name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Feld>
      <Feld id="e-org" label="Organisation"><Input id="e-org" value={w.organisation} onChange={(e) => setW({ ...w, organisation: e.target.value })} /></Feld>
      <Feld id="e-fkt" label="Funktion"><Input id="e-fkt" value={w.funktion} onChange={(e) => setW({ ...w, funktion: e.target.value })} /></Feld>
      <Feld id="e-mail" label="E-Mail (für spätere Erinnerungen)"><Input id="e-mail" type="email" value={w.email} onChange={(e) => setW({ ...w, email: e.target.value })} /></Feld>
      <Haken label="aktiv" wert={w.aktiv} setze={(v) => setW({ ...w, aktiv: v })} />
    </FormSheet>
  );
}

// ── Exportprofile (Spec 9.5, Phase 10) ──────────────────────────────────────

const EXPORT_FELDER: [string, string][] = [
  ["startDatum", "Beginn Datum"], ["startZeit", "Beginn Uhrzeit"], ["endeDatum", "Ende Datum"], ["endeZeit", "Ende Uhrzeit"],
  ["start", "Beginn (Datum und Uhrzeit)"], ["ende", "Ende (Datum und Uhrzeit)"], ["startIso", "Beginn ISO 8601"], ["endeIso", "Ende ISO 8601"],
  ["ganztaegig", "Ganztägig (0/1)"], ["titel", "Titel (Themen)"], ["titelMitKategorie", "Titel mit Kategorie"],
  ["verantwortliche", "Verantwortliche"], ["beschreibung", "Beschreibung (mehrzeilig)"], ["kategorieKuerzel", "Kategorie-Kürzel"],
  ["kategorieName", "Kategorie-Name"], ["ort", "Ort"], ["bemerkung", "Bemerkung"], ["terminId", "Termin-id"], ["fest", "Fester Wert"],
];
const FELD_TEXT = Object.fromEntries(EXPORT_FELDER);
const MIT_FORMAT = new Set(["startDatum", "startZeit", "endeDatum", "endeZeit", "start", "ende"]);

interface Spalte { ueberschrift: string; feld: string; format?: string | null; wert?: string | null }
interface Profil { id: number; name: string; trennzeichen: string; kodierung: string; kopfzeile: boolean; spalten: Spalte[]; nurFreigegeben: boolean; kategorien: string[] | null }

function ExportProfile({ istAdmin }: { istAdmin: boolean }) {
  const { liste, fehler, neu } = useListe<Profil>("/export-profile", "profile");
  const [form, setForm] = useState<Profil | "neu" | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  return (
    <Abschnitt titel="Exportprofile (CSV)" beschreibung={istAdmin ? "Spaltenfolge, Überschriften, Formate, Trennzeichen und Kodierung je Zielsystem, z. B. DIVERA 24/7." : "Ändern darf der Dienstplan-Admin."}
      aktion={istAdmin && <Button size="sm" onClick={() => setForm("neu")}><Plus /> Profil</Button>}>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      {meldung && <p role="alert" className="mb-2 text-sm text-destructive">{meldung}</p>}
      <ul className="grid gap-3">
        {(liste ?? []).map((p) => (
          <li key={p.id} className="rounded-lg border p-3" data-profil={p.name}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.trennzeichen === "\t" ? "Tab" : p.trennzeichen} · {p.kodierung} · {p.kopfzeile ? "mit Kopfzeile" : "ohne Kopfzeile"}
                  {p.nurFreigegeben ? " · nur freigegebene Pläne" : ""}{p.kategorien ? ` · nur ${p.kategorien.join(", ")}` : ""}
                </p>
                <p className="break-words font-mono text-xs text-muted-foreground">{p.spalten.map((sp) => sp.ueberschrift || FELD_TEXT[sp.feld]).join(p.trennzeichen === "\t" ? " ⇥ " : ` ${p.trennzeichen} `)}</p>
              </div>
              {istAdmin && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setForm(p)}>Bearbeiten</Button>
                  <Button size="sm" variant="ghost" aria-label={`Profil ${p.name} löschen`} onClick={async () => {
                    if (!confirm(`Profil „${p.name}“ löschen?`)) return;
                    const r = await dpApi("DELETE", `/export-profile/${p.id}`);
                    setMeldung(r.ok ? null : r.message);
                    if (r.ok) await neu();
                  }}><X /></Button>
                </div>
              )}
            </div>
          </li>
        ))}
        {liste?.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Keine Profile</li>}
      </ul>
      {form && <ProfilForm p={form === "neu" ? null : form} schliessen={() => setForm(null)} danach={neu} />}
    </Abschnitt>
  );
}

function ProfilForm({ p, schliessen, danach }: { p: Profil | null; schliessen: () => void; danach: () => Promise<void> }) {
  const [w, setW] = useState({
    name: p?.name ?? "", trennzeichen: p?.trennzeichen ?? ";", kodierung: p?.kodierung ?? "utf-8-bom", kopfzeile: p?.kopfzeile ?? true,
    nurFreigegeben: p?.nurFreigegeben ?? true, kategorien: (p?.kategorien ?? []).join(","),
  });
  const [spalten, setSpalten] = useState<Spalte[]>(p?.spalten ?? [{ ueberschrift: "Datum", feld: "startDatum", format: "DD.MM.YYYY" }]);
  const aendere = (i: number, x: Partial<Spalte>) => setSpalten(spalten.map((s, j) => (j === i ? { ...s, ...x } : s)));
  const tausche = (i: number, j: number) => { const n = [...spalten]; [n[i], n[j]] = [n[j], n[i]]; setSpalten(n); };
  return (
    <FormSheet titel={p ? `Profil ${p.name}` : "Neues Exportprofil"}
      beschreibung="Formate mit YYYY, MM, DD, HH, mm (z. B. DD.MM.YYYY oder HH:mm). Ohne Uhrzeit (ganztägig) bleiben Uhrzeitfelder leer."
      schliessen={schliessen}
      absenden={() => speichere("/export-profile", p?.id ?? null, {
        name: w.name, trennzeichen: w.trennzeichen, kodierung: w.kodierung, kopfzeile: w.kopfzeile, nurFreigegeben: w.nurFreigegeben,
        kategorien: w.kategorien.split(",").map((k) => k.trim()).filter(Boolean),
        spalten: spalten.map((s) => ({ ueberschrift: s.ueberschrift, feld: s.feld, format: MIT_FORMAT.has(s.feld) ? s.format || null : null, wert: s.feld === "fest" ? s.wert ?? "" : null })),
      }, danach)}>
      <Feld id="p-name" label="Name"><Input id="p-name" required maxLength={80} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Feld>
      <div className="grid grid-cols-2 gap-3">
        <Feld id="p-trenner" label="Trennzeichen">
          <select id="p-trenner" className={selectKlasse} value={w.trennzeichen} onChange={(e) => setW({ ...w, trennzeichen: e.target.value })}>
            <option value=";">Semikolon ;</option><option value=",">Komma ,</option><option value={"\t"}>Tabulator</option>
          </select>
        </Feld>
        <Feld id="p-kodierung" label="Kodierung">
          <select id="p-kodierung" className={selectKlasse} value={w.kodierung} onChange={(e) => setW({ ...w, kodierung: e.target.value })}>
            <option value="utf-8-bom">UTF-8 mit BOM (Excel)</option><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252</option>
          </select>
        </Feld>
      </div>
      <Haken label="Kopfzeile mit Überschriften" wert={w.kopfzeile} setze={(v) => setW({ ...w, kopfzeile: v })} />
      <Haken label="Nur freigegebene Pläne exportieren" wert={w.nurFreigegeben} setze={(v) => setW({ ...w, nurFreigegeben: v })} />
      <Feld id="p-kat" label="Nur Kategorien (Kürzel mit Komma, leer = alle)"><Input id="p-kat" value={w.kategorien} placeholder="z. B. D,Z" onChange={(e) => setW({ ...w, kategorien: e.target.value })} /></Feld>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Spalten</p>
        {spalten.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-2" data-spalte={i}>
            <div className="flex gap-2">
              <Input aria-label={`Überschrift Spalte ${i + 1}`} value={s.ueberschrift} placeholder="Überschrift" onChange={(e) => aendere(i, { ueberschrift: e.target.value })} />
              <Button type="button" size="icon-sm" variant="ghost" aria-label="nach oben" disabled={i === 0} onClick={() => tausche(i, i - 1)}><ArrowUp /></Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="nach unten" disabled={i === spalten.length - 1} onClick={() => tausche(i, i + 1)}><ArrowDown /></Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Spalte entfernen" disabled={spalten.length === 1} onClick={() => setSpalten(spalten.filter((_, j) => j !== i))}><X /></Button>
            </div>
            <select aria-label={`Feld Spalte ${i + 1}`} className={selectKlasse} value={s.feld} onChange={(e) => aendere(i, { feld: e.target.value })}>
              {EXPORT_FELDER.map(([f, t]) => <option key={f} value={f}>{t}</option>)}
            </select>
            {MIT_FORMAT.has(s.feld) && <Input aria-label={`Format Spalte ${i + 1}`} value={s.format ?? ""} placeholder="Format, z. B. DD.MM.YYYY" onChange={(e) => aendere(i, { format: e.target.value })} />}
            {s.feld === "fest" && <Input aria-label={`Wert Spalte ${i + 1}`} value={s.wert ?? ""} placeholder="Wert in jeder Zeile" onChange={(e) => aendere(i, { wert: e.target.value })} />}
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setSpalten([...spalten, { ueberschrift: "", feld: "titel" }])}><Plus /> Spalte</Button>
      </div>
    </FormSheet>
  );
}

// ── iCal-Abo (Spec 9.4, Phase 10) ───────────────────────────────────────────

function IcalAbo() {
  const [abo, setAbo] = useState<{ erstelltAm: string; zuletztAbgerufenAm: string | null; abrufe: number } | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const hole = useCallback(() => dpApi<{ abo: typeof abo }>("GET", "/abo"), []);
  const laden = useCallback(async () => {
    const r = await hole();
    if (r.ok) setAbo(r.data.abo); else setMeldung(r.message);
  }, [hole]);
  useEffect(() => {
    let aktiv = true;
    void hole().then((r) => { if (!aktiv) return; if (r.ok) setAbo(r.data.abo); else setMeldung(r.message); });
    return () => { aktiv = false; };
  }, [hole]);
  const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  return (
    <Abschnitt titel="iCal-Abo" beschreibung="Geheime Adresse für Google-Kalender und DIVERA (nur freigegebene Pläne ab dem Vorjahr, ohne Notizen). Die Adresse wird nur beim Erzeugen angezeigt; neu erzeugen macht die alte ungültig.">
      <div className="grid gap-3" data-testid="ical-abo">
        <p className="text-sm">
          {abo === undefined ? "Wird geladen …" : abo === null ? "Kein aktives Abo." :
            `Aktiv seit ${zeit(abo.erstelltAm)} · ${abo.abrufe} Abrufe${abo.zuletztAbgerufenAm ? `, zuletzt ${zeit(abo.zuletztAbgerufenAm)}` : ""}`}
        </p>
        {url && (
          <div className="grid gap-2 rounded-lg border p-3">
            <p className="break-all font-mono text-xs" data-testid="abo-url">{url}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                try { await navigator.clipboard.writeText(url); setMeldung("Adresse kopiert."); } catch { setMeldung("Kopieren nicht möglich, Adresse bitte markieren."); }
              }}>Kopieren</Button>
            </div>
            <p className="text-xs text-muted-foreground">Google-Kalender: Weitere Kalender → Per URL. DIVERA: Termine → ICS-Kalender importieren. Jetzt kopieren, die Adresse wird nicht wieder angezeigt.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={busy} onClick={async () => {
            if (abo && !confirm("Neue Adresse erzeugen? Die bisherige funktioniert danach nicht mehr (Google und DIVERA neu einrichten).")) return;
            setBusy(true);
            const r = await dpApi<{ pfad: string }>("POST", "/abo");
            setBusy(false);
            if (!r.ok) { setMeldung(r.message); return; }
            setUrl(`${window.location.origin}${r.data.pfad}`);
            setMeldung(null);
            await laden();
          }}>{abo ? "Neue Adresse erzeugen" : "Abo-Adresse erzeugen"}</Button>
          {abo && (
            <Button size="sm" variant="outline" onClick={async () => {
              if (!confirm("Abo beenden? Kalender, die es abonniert haben, bekommen danach keine Termine mehr.")) return;
              const r = await dpApi("DELETE", "/abo");
              if (!r.ok) setMeldung(r.message);
              setUrl(null);
              await laden();
            }}>Abo beenden</Button>
          )}
        </div>
        {meldung && <p role="status" className="text-sm">{meldung}</p>}
      </div>
    </Abschnitt>
  );
}
