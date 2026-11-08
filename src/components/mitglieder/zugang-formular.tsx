"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ABMELDE_HINWEIS, apiCall, type Meldung } from "./api-client";

export interface ZugangAnsicht {
  benutzerId: number;
  benutzername: string;
  rolle: string;
  aktiv: boolean;
}

export function ZugangFormular({
  kameradId,
  kameradName,
  kameradAktiv,
  zugang,
  eigeneBenutzerId,
  appRollen,
  vorschlagBenutzername,
}: {
  kameradId: number;
  kameradName: string;
  kameradAktiv: boolean;
  zugang: ZugangAnsicht | null;
  eigeneBenutzerId: number;
  appRollen: string[];
  vorschlagBenutzername: string;
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Login anlegen
  const [neuName, setNeuName] = useState(vorschlagBenutzername);
  const [neuPin, setNeuPin] = useState("");
  const [neuPin2, setNeuPin2] = useState("");
  const [neuRolle, setNeuRolle] = useState("User");

  // PIN zurücksetzen und Rolle
  const [resetPin, setResetPin] = useState("");
  const [resetPin2, setResetPin2] = useState("");
  const [rolle, setRolle] = useState(zugang?.rolle ?? "User");

  async function ausfuehren(
    art: string,
    aufruf: () => ReturnType<typeof apiCall>,
    erfolg: string,
    danach?: () => void,
  ) {
    setBusy(art);
    const r = await aufruf();
    setBusy(null);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: erfolg });
    danach?.();
    router.refresh();
  }

  function anlegen(e: React.FormEvent) {
    e.preventDefault();
    if (neuPin !== neuPin2) return setMeldung({ ok: false, text: "Die PINs stimmen nicht überein." });
    return ausfuehren(
      "anlegen",
      () => apiCall("POST", "/api/admin/benutzer", { kameradId, benutzername: neuName.trim(), pin: neuPin, rolle: neuRolle }),
      `Login ${neuName.trim()} angelegt.`,
      () => { setNeuPin(""); setNeuPin2(""); },
    );
  }

  function pinZuruecksetzen(e: React.FormEvent) {
    e.preventDefault();
    if (!zugang) return;
    if (resetPin !== resetPin2) return setMeldung({ ok: false, text: "Die PINs stimmen nicht überein." });
    return ausfuehren(
      "pin",
      () => apiCall("PATCH", `/api/admin/benutzer/${zugang.benutzerId}`, { pin: resetPin }),
      "PIN zurückgesetzt. Die Person wird beim nächsten Aufruf abgemeldet.",
      () => { setResetPin(""); setResetPin2(""); },
    );
  }

  function sperren() {
    if (!zugang) return;
    const ziel = !zugang.aktiv;
    if (!ziel && !window.confirm(`Login ${zugang.benutzername} sperren? Die Person wird sofort abgemeldet.`)) return;
    return ausfuehren(
      "aktiv",
      () => apiCall("PATCH", `/api/admin/benutzer/${zugang.benutzerId}`, { aktiv: ziel }),
      ziel ? "Login entsperrt." : "Login gesperrt.",
    );
  }

  function rolleSpeichern() {
    if (!zugang) return;
    return ausfuehren(
      "rolle",
      () => apiCall("PATCH", `/api/admin/benutzer/${zugang.benutzerId}`, { rolle }),
      "Rolle gespeichert.",
    );
  }

  const meldungsBlock = meldung && (
    <p role={meldung.ok ? "status" : "alert"} className={meldung.ok ? "text-sm text-success" : "text-sm text-destructive"}>
      {meldung.text}
    </p>
  );

  // ── Noch kein Login ──
  if (!zugang) {
    if (!kameradAktiv) {
      return (
        <p className="text-sm text-muted-foreground">
          {kameradName} ist deaktiviert und hat keinen Login. Erst das Mitglied aktivieren, dann kann ein Login angelegt werden.
        </p>
      );
    }
    return (
      <form onSubmit={anlegen} className="grid gap-4">
        <p className="text-sm text-muted-foreground">{kameradName} hat noch keinen Login.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="zugang-name">Benutzername</Label>
            <Input id="zugang-name" value={neuName} onChange={(e) => setNeuName(e.target.value)} required maxLength={64} autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="zugang-rolle-neu">App-Rolle</Label>
            <Select value={neuRolle} onValueChange={setNeuRolle}>
              <SelectTrigger id="zugang-rolle-neu" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {appRollen.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="zugang-pin">PIN (mind. 6 Zeichen)</Label>
            <Input id="zugang-pin" type="password" value={neuPin} onChange={(e) => setNeuPin(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="zugang-pin2">PIN wiederholen</Label>
            <Input id="zugang-pin2" type="password" value={neuPin2} onChange={(e) => setNeuPin2(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
        </div>
        <div><Button type="submit" loading={busy === "anlegen"}>Login anlegen</Button></div>
        {meldungsBlock}
      </form>
    );
  }

  // ── Login vorhanden ──
  const selbst = zugang.benutzerId === eigeneBenutzerId;
  return (
    <div className="grid gap-5">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Benutzername</dt>
          <dd className="font-medium break-all">{zugang.benutzername}{selbst && <span className="ml-1 text-xs font-normal text-muted-foreground">(du)</span>}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">App-Rolle</dt>
          <dd><Badge variant={zugang.rolle === "Admin" ? "default" : "secondary"}>{zugang.rolle}</Badge></dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Status</dt>
          <dd><Badge variant={zugang.aktiv ? "secondary" : "destructive"}>{zugang.aktiv ? "aktiv" : "gesperrt"}</Badge></dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="grid gap-2">
          <Label htmlFor="zugang-rolle">App-Rolle ändern</Label>
          <Select value={rolle} onValueChange={setRolle} disabled={selbst}>
            <SelectTrigger id="zugang-rolle" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {appRollen.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={rolleSpeichern} loading={busy === "rolle"} disabled={rolle === zugang.rolle || selbst}>
          Rolle speichern
        </Button>
        <Button type="button" variant={zugang.aktiv ? "outline" : "default"} onClick={sperren} loading={busy === "aktiv"} disabled={selbst && zugang.aktiv}>
          {zugang.aktiv ? "Login sperren" : "Login entsperren"}
        </Button>
        {selbst && <span className="text-xs text-muted-foreground">Den eigenen Login kannst du weder sperren noch herabstufen.</span>}
      </div>

      <form onSubmit={pinZuruecksetzen} className="grid gap-3 border-t pt-4">
        <p className="text-sm font-medium">PIN zurücksetzen</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="reset-pin">Neue PIN (mind. 6 Zeichen)</Label>
            <Input id="reset-pin" type="password" value={resetPin} onChange={(e) => setResetPin(e.target.value)} minLength={6} autoComplete="new-password" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reset-pin2">Neue PIN wiederholen</Label>
            <Input id="reset-pin2" type="password" value={resetPin2} onChange={(e) => setResetPin2(e.target.value)} minLength={6} autoComplete="new-password" />
          </div>
        </div>
        <div><Button type="submit" variant="outline" loading={busy === "pin"} disabled={resetPin.length < 6}>PIN zurücksetzen</Button></div>
      </form>

      <p className="text-xs text-muted-foreground">{ABMELDE_HINWEIS}</p>
      {meldungsBlock}
    </div>
  );
}
