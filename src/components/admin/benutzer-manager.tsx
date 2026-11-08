"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface BenutzerRow {
  id: number;
  benutzername: string;
  rolle: string;
  aktiv: boolean;
  kameradId: number;
  vorname: string;
  name: string;
  kameradAktiv: boolean;
  psaRolle: string | null;
  foodRolle: string | null;
  fkRolle: string | null;
  funkRolle: string | null;
}

export interface KameradOption {
  id: number;
  vorname: string;
  name: string;
}

type RollenSpalte = "psaRolle" | "foodRolle" | "fkRolle" | "funkRolle";
const SPALTEN: { key: RollenSpalte; label: string }[] = [
  { key: "psaRolle", label: "PSA" },
  { key: "foodRolle", label: "Küche" },
  { key: "fkRolle", label: "FK" },
  { key: "funkRolle", label: "Funk" },
];
const KEINE = "__keine__"; // Radix-Select erlaubt keinen leeren Wert

type Aktion =
  | { art: "aktiv"; row: BenutzerRow }
  | { art: "pin"; row: BenutzerRow }
  | { art: "rollen"; row: BenutzerRow };

const ABMELDE_HINWEIS =
  "Hinweis: Eine Rollenänderung, ein PIN-Reset oder eine Deaktivierung meldet den Benutzer beim nächsten Request ab. Neue Rollen gelten nach erneutem Login.";

// API-Aufruf mit Anzeige der Fehlermeldung der API (409, 429, 403, …).
async function apiCall(
  method: string,
  url: string,
  body: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data };
    const msg =
      (data as { error?: string }).error ?? "Unbekannter Fehler";
    return { ok: false, message: `Fehler ${res.status}: ${msg}` };
  } catch {
    return { ok: false, message: "Netzwerkfehler" };
  }
}

export function BenutzerManager({
  rows,
  freieKameraden,
  eigeneBenutzerId,
  modulRollen,
  appRollen,
}: {
  rows: BenutzerRow[];
  freieKameraden: KameradOption[];
  eigeneBenutzerId: number;
  modulRollen: Record<RollenSpalte, string[]>;
  appRollen: string[];
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Anlegen ──
  const [neuKamerad, setNeuKamerad] = useState("");
  const [neuName, setNeuName] = useState("");
  const [neuPin, setNeuPin] = useState("");
  const [neuPin2, setNeuPin2] = useState("");
  const [neuRolle, setNeuRolle] = useState("User");

  async function anlegen(e: React.FormEvent) {
    e.preventDefault();
    if (neuPin !== neuPin2) {
      setMeldung({ ok: false, text: "Die PINs stimmen nicht überein." });
      return;
    }
    setBusy(true);
    const r = await apiCall("POST", "/api/admin/benutzer", {
      kameradId: Number(neuKamerad),
      benutzername: neuName,
      pin: neuPin,
      rolle: neuRolle,
    });
    setBusy(false);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: `Benutzer ${neuName} angelegt.` });
    setNeuKamerad("");
    setNeuName("");
    setNeuPin("");
    setNeuPin2("");
    setNeuRolle("User");
    router.refresh();
  }

  // ── Aktionen (Bereich unter der Tabelle) ──
  const [aktion, setAktion] = useState<Aktion | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [resetPin2, setResetPin2] = useState("");
  const [rollen, setRollen] = useState<Record<RollenSpalte, string>>({
    psaRolle: KEINE,
    foodRolle: KEINE,
    fkRolle: KEINE,
    funkRolle: KEINE,
  });
  const [globalRolle, setGlobalRolle] = useState("User");

  function oeffne(a: Aktion) {
    setMeldung(null);
    setAktion(a);
    setResetPin("");
    setResetPin2("");
    if (a.art === "rollen") {
      setRollen({
        psaRolle: a.row.psaRolle ?? KEINE,
        foodRolle: a.row.foodRolle ?? KEINE,
        fkRolle: a.row.fkRolle ?? KEINE,
        funkRolle: a.row.funkRolle ?? KEINE,
      });
      setGlobalRolle(a.row.rolle);
    }
  }

  async function ausfuehren() {
    if (!aktion) return;
    const { row } = aktion;
    setBusy(true);
    let r;
    if (aktion.art === "aktiv") {
      r = await apiCall("PATCH", `/api/admin/benutzer/${row.id}`, { aktiv: !row.aktiv });
    } else if (aktion.art === "pin") {
      if (resetPin !== resetPin2) {
        setBusy(false);
        return setMeldung({ ok: false, text: "Die PINs stimmen nicht überein." });
      }
      r = await apiCall("PATCH", `/api/admin/benutzer/${row.id}`, { pin: resetPin });
    } else {
      const body: Record<string, string | null> = {};
      for (const { key } of SPALTEN) body[key] = rollen[key] === KEINE ? null : rollen[key];
      r = await apiCall("PATCH", `/api/admin/rollen/${row.kameradId}`, body);
      if (r.ok && globalRolle !== row.rolle) {
        r = await apiCall("PATCH", `/api/admin/benutzer/${row.id}`, { rolle: globalRolle });
      }
    }
    setBusy(false);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: `Änderung für ${row.benutzername} gespeichert.` });
    setAktion(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {meldung && (
        <div
          role={meldung.ok ? "status" : "alert"}
          className={
            meldung.ok
              ? "rounded-md border border-success/40 bg-success/10 p-3 text-sm"
              : "rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          }
        >
          {meldung.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Benutzer</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kamerad</TableHead>
                <TableHead>Benutzername</TableHead>
                <TableHead>Globale Rolle</TableHead>
                <TableHead>Status</TableHead>
                {SPALTEN.map((s) => (
                  <TableHead key={s.key}>{s.label}</TableHead>
                ))}
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const selbst = row.id === eigeneBenutzerId;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      {/* Lange Namen kürzen (voller Name per title), damit die
                          Spalte "Aktionen" im sichtbaren Bereich bleibt. */}
                      <span
                        className="block max-w-[9rem] truncate"
                        title={`${row.vorname} ${row.name}`}
                      >
                        {row.vorname} {row.name}
                      </span>
                      {!row.kameradAktiv && (
                        <span className="block text-xs text-muted-foreground">(Kamerad inaktiv)</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        <span
                          className="max-w-[9rem] truncate"
                          title={row.benutzername}
                        >
                          {row.benutzername}
                        </span>
                        {selbst && <span className="shrink-0 text-xs font-normal text-muted-foreground">(du)</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.rolle === "Admin" ? "default" : "secondary"}>{row.rolle}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.aktiv ? "secondary" : "destructive"}>
                        {row.aktiv ? "aktiv" : "deaktiviert"}
                      </Badge>
                    </TableCell>
                    {SPALTEN.map((s) => (
                      <TableCell key={s.key}>
                        {row[s.key] ?? <span className="text-muted-foreground">–</span>}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={selbst && row.aktiv}
                          title={selbst && row.aktiv ? "Du kannst dich nicht selbst deaktivieren" : undefined}
                          onClick={() => oeffne({ art: "aktiv", row })}
                        >
                          {row.aktiv ? "Deaktivieren" : "Aktivieren"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => oeffne({ art: "pin", row })}>
                          PIN zurücksetzen
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => oeffne({ art: "rollen", row })}>
                          Rollen
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {aktion && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>
              {aktion.art === "aktiv" &&
                `${aktion.row.aktiv ? "Deaktivieren" : "Aktivieren"}: ${aktion.row.benutzername}`}
              {aktion.art === "pin" && `PIN zurücksetzen: ${aktion.row.benutzername}`}
              {aktion.art === "rollen" && `Rollen ändern: ${aktion.row.benutzername}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
              {ABMELDE_HINWEIS}
            </p>

            {aktion.art === "aktiv" && (
              <p className="text-sm">
                {aktion.row.aktiv
                  ? `${aktion.row.vorname} ${aktion.row.name} kann sich danach nicht mehr anmelden.`
                  : `${aktion.row.vorname} ${aktion.row.name} kann sich danach wieder anmelden.`}
              </p>
            )}

            {aktion.art === "pin" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="reset-pin">Neue PIN (mind. 6 Zeichen)</Label>
                  <Input id="reset-pin" type="password" autoComplete="new-password" value={resetPin} onChange={(e) => setResetPin(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reset-pin2">PIN bestätigen</Label>
                  <Input id="reset-pin2" type="password" autoComplete="new-password" value={resetPin2} onChange={(e) => setResetPin2(e.target.value)} />
                </div>
              </div>
            )}

            {aktion.art === "rollen" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="grid gap-2">
                  <Label>Globale Rolle</Label>
                  <Select value={globalRolle} onValueChange={setGlobalRolle}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {appRollen.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {SPALTEN.map((s) => (
                  <div key={s.key} className="grid gap-2">
                    <Label>{s.label}</Label>
                    <Select
                      value={rollen[s.key]}
                      onValueChange={(v) => setRollen((prev) => ({ ...prev, [s.key]: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEINE}>– keine –</SelectItem>
                        {modulRollen[s.key].map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={ausfuehren} loading={busy}>
                {busy ? "Speichere …" : "Bestätigen"}
              </Button>
              <Button variant="outline" onClick={() => setAktion(null)} disabled={busy}>
                Abbrechen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Benutzer anlegen</CardTitle>
        </CardHeader>
        <CardContent>
          {freieKameraden.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Alle aktiven Kameraden haben bereits einen Account.
            </p>
          ) : (
            <form onSubmit={anlegen} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="grid gap-2">
                <Label>Kamerad</Label>
                <Select value={neuKamerad} onValueChange={setNeuKamerad}>
                  <SelectTrigger><SelectValue placeholder="Kamerad wählen" /></SelectTrigger>
                  <SelectContent>
                    {freieKameraden.map((k) => (
                      <SelectItem key={k.id} value={String(k.id)}>
                        {k.vorname} {k.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="neu-name">Benutzername</Label>
                <Input id="neu-name" autoComplete="off" value={neuName} onChange={(e) => setNeuName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="neu-pin">PIN (mind. 6 Zeichen)</Label>
                <Input id="neu-pin" type="password" autoComplete="new-password" value={neuPin} onChange={(e) => setNeuPin(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="neu-pin2">PIN bestätigen</Label>
                <Input id="neu-pin2" type="password" autoComplete="new-password" value={neuPin2} onChange={(e) => setNeuPin2(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Globale Rolle</Label>
                <Select value={neuRolle} onValueChange={setNeuRolle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {appRollen.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-5">
                <Button type="submit" loading={busy} disabled={!neuKamerad || !neuName || !neuPin}>
                  Anlegen
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
