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
      <Bloecke />
      <ExternePersonen />
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
  return (
    <Abschnitt titel="Themenkatalog" beschreibung="Themen werden nicht gelöscht (sie hängen an alten Plänen), sondern deaktiviert."
      aktion={<Button size="sm" onClick={() => setForm("neu")}><Plus /> Thema</Button>}>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
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
