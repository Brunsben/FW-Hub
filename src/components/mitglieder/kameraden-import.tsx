"use client";

import { useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AbgleichZeile, ImportStatus } from "@/lib/mitglieder/csv-import";
import { apiCall } from "./api-client";

const STATUS_TEXT: Record<ImportStatus, string> = {
  neu: "neu",
  pruefen: "prüfen",
  ergaenzen: "ergänzen",
  vorhanden: "vorhanden",
  konflikt: "Konflikt",
};
const STATUS_VARIANTE: Record<ImportStatus, "default" | "secondary" | "outline" | "destructive"> = {
  neu: "default",
  pruefen: "outline",
  ergaenzen: "secondary",
  vorhanden: "outline",
  konflikt: "destructive",
};
const uebernehmbar = (s: ImportStatus) => s === "neu" || s === "pruefen" || s === "ergaenzen";

interface Vorschau {
  format: "tabelle" | "anwesenheitsliste";
  fehler: { zeile: number; text: string }[];
  zeilen: AbgleichZeile[];
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// CSV-Import von Kameraden (nur globaler Admin): Datei wählen → Vorschau mit
// Abgleich → ausgewählte Zeilen übernehmen. Die Datei bleibt nur im Browser
// und wird für beide Schritte neu geschickt; gespeichert wird sie nirgends.
export function KameradenImport({ onFertig, onAbbrechen }: { onFertig: (text: string) => void; onAbbrechen: () => void }) {
  const [datei, setDatei] = useState<{ name: string; inhalt: string } | null>(null);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<"alle" | "auswahl">("alle");
  const [busy, setBusy] = useState<"vorschau" | "import" | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function waehlen(f: File | undefined) {
    setVorschau(null);
    setFehler(null);
    if (!f) { setDatei(null); return; }
    const inhalt = base64(await f.arrayBuffer());
    setDatei({ name: f.name, inhalt });
    setBusy("vorschau");
    const r = await apiCall("POST", "/api/mitglieder/import", { datei: inhalt });
    setBusy(null);
    if (!r.ok) { setFehler(r.message); return; }
    const v = r.data as Vorschau;
    setVorschau(v);
    setAuswahl(new Set(v.zeilen.filter((z) => z.vorausgewaehlt).map((z) => z.zeile)));
  }

  async function uebernehmen() {
    if (!datei || auswahl.size === 0) return;
    setBusy("import");
    const r = await apiCall("POST", "/api/mitglieder/import", { datei: datei.inhalt, uebernehmen: [...auswahl] });
    setBusy(null);
    if (!r.ok) { setFehler(r.message); return; }
    const d = r.data as { angelegt: number; ergaenzt: number };
    onFertig(`Import: ${d.angelegt} Kamerad(en) angelegt, ${d.ergaenzt} ergänzt.`);
  }

  function vorlage() {
    const blob = new Blob(["﻿Nachname;Vorname;Spitzname;Personalnummer\r\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kameraden-vorlage.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const zaehler = useMemo(() => {
    const z: Record<ImportStatus, number> = { neu: 0, pruefen: 0, ergaenzen: 0, vorhanden: 0, konflikt: 0 };
    vorschau?.zeilen.forEach((x) => { z[x.status]++; });
    return z;
  }, [vorschau]);
  const anzuzeigen = vorschau
    ? vorschau.zeilen.filter((z) => filter === "alle" || uebernehmbar(z.status))
    : [];
  const umschalten = (zeile: number) => {
    const n = new Set(auswahl);
    if (n.has(zeile)) n.delete(zeile); else n.add(zeile);
    setAuswahl(n);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kameraden aus CSV importieren</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Erkannt werden eine Tabelle mit Kopfzeile <span className="font-mono">Nachname;Vorname;Spitzname;Personalnummer</span>{" "}
          (Spitzname und Personalnummer optional) und die Anwesenheitsliste der Kreis-Mitgliederverwaltung
          („Nachname, Vorname (Personalnummer)“). Vorhandene Kameraden werden nie überschrieben, nur leere
          Personalnummern oder Spitznamen ergänzt. Erst nach „Übernehmen“ wird etwas gespeichert.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="import-datei">CSV-Datei</Label>
            <Input id="import-datei" type="file" accept=".csv,text/csv,text/plain" className="max-w-sm"
              onChange={(e) => void waehlen(e.target.files?.[0])} />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={vorlage}><Download aria-hidden /> Vorlage</Button>
          {busy === "vorschau" && <span className="text-sm text-muted-foreground">Vorschau wird erstellt …</span>}
        </div>

        {fehler && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{fehler}</p>}

        {vorschau && (
          <>
            <p className="text-sm" data-testid="import-zusammenfassung">
              {vorschau.format === "anwesenheitsliste" ? "Anwesenheitsliste" : "Tabelle"} · {vorschau.zeilen.length} Personen:{" "}
              {zaehler.neu} neu, {zaehler.ergaenzen} ergänzen, {zaehler.pruefen} prüfen, {zaehler.vorhanden} vorhanden,{" "}
              {zaehler.konflikt} Konflikte{vorschau.fehler.length > 0 && `, ${vorschau.fehler.length} unlesbare Zeilen`}.
            </p>
            {vorschau.fehler.length > 0 && (
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {vorschau.fehler.map((f) => <li key={f.zeile}>Zeile {f.zeile}: {f.text}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button type="button" size="sm" variant={filter === "alle" ? "secondary" : "ghost"} onClick={() => setFilter("alle")}>Alle Zeilen</Button>
              <Button type="button" size="sm" variant={filter === "auswahl" ? "secondary" : "ghost"} onClick={() => setFilter("auswahl")}>Nur übernehmbare</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><span className="sr-only">Übernehmen</span></TableHead>
                  <TableHead>Zeile</TableHead>
                  <TableHead>Nachname</TableHead>
                  <TableHead>Vorname</TableHead>
                  <TableHead>Spitzname</TableHead>
                  <TableHead>Pers.-Nr.</TableHead>
                  <TableHead>Ergebnis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anzuzeigen.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Keine Zeilen</TableCell></TableRow>
                )}
                {anzuzeigen.map((z) => (
                  <TableRow key={z.zeile} data-status={z.status}>
                    <TableCell>
                      {uebernehmbar(z.status) && (
                        <input type="checkbox" aria-label={`Zeile ${z.zeile} übernehmen`} checked={auswahl.has(z.zeile)}
                          onChange={() => umschalten(z.zeile)} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{z.zeile}</TableCell>
                    <TableCell>{z.nachname}</TableCell>
                    <TableCell>{z.vorname}</TableCell>
                    <TableCell>{z.spitzname ?? ""}</TableCell>
                    <TableCell className="font-mono text-xs">{z.personalnummer ?? ""}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS_VARIANTE[z.status]}>{STATUS_TEXT[z.status]}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {z.status === "ergaenzen" && `${z.ergaenzt.map((f) => (f === "personalnummer" ? "Personalnummer" : "Spitzname")).join(" und ")} nachtragen`}
                          {z.hinweis && `${z.status === "ergaenzen" ? " · " : ""}${z.hinweis}`}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={uebernehmen} loading={busy === "import"} disabled={!vorschau || auswahl.size === 0}>
            <Upload aria-hidden /> {auswahl.size} Zeile(n) übernehmen
          </Button>
          <Button type="button" variant="ghost" onClick={onAbbrechen}>Abbrechen</Button>
        </div>
      </CardContent>
    </Card>
  );
}
