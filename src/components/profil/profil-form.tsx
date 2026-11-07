"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Meldung = { ok: boolean; text: string } | null;

function MeldungBox({ m }: { m: Meldung }) {
  if (!m) return null;
  return (
    <p
      role={m.ok ? "status" : "alert"}
      className={
        m.ok
          ? "rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm"
          : "rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
      }
    >
      {m.text}
    </p>
  );
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, error: (data as { error?: string }).error };
}

export function ProfilForm() {
  const router = useRouter();
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [neu2, setNeu2] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinMeldung, setPinMeldung] = useState<Meldung>(null);
  const [abmeldenMeldung, setAbmeldenMeldung] = useState<Meldung>(null);

  async function pinAendern(e: React.FormEvent) {
    e.preventDefault();
    if (neu !== neu2) {
      setPinMeldung({ ok: false, text: "Neue PIN und Bestätigung stimmen nicht überein." });
      return;
    }
    setBusy(true);
    try {
      const { res, error } = await post("/api/auth/pin", { altePin: alt, neuePin: neu });
      if (res.ok) {
        setPinMeldung({
          ok: true,
          text: "PIN geändert. Andere Sitzungen wurden abgemeldet, diese bleibt angemeldet.",
        });
        setAlt("");
        setNeu("");
        setNeu2("");
      } else {
        // 403 (alte PIN falsch), 429 (Sperre), 400 (Validierung): Meldung der API
        setPinMeldung({ ok: false, text: `Fehler ${res.status}: ${error ?? "Unbekannter Fehler"}` });
      }
    } catch {
      setPinMeldung({ ok: false, text: "Netzwerkfehler" });
    } finally {
      setBusy(false);
    }
  }

  async function ueberallAbmelden() {
    setBusy(true);
    try {
      const { res, error } = await post("/api/auth/abmelden-ueberall");
      if (res.ok) {
        router.replace("/login");
        router.refresh();
        return;
      }
      setAbmeldenMeldung({ ok: false, text: `Fehler ${res.status}: ${error ?? "Unbekannter Fehler"}` });
    } catch {
      setAbmeldenMeldung({ ok: false, text: "Netzwerkfehler" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>PIN ändern</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={pinAendern} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="alt">Aktuelle PIN</Label>
              <Input id="alt" type="password" autoComplete="current-password" value={alt} onChange={(e) => setAlt(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="neu">Neue PIN (mind. 6 Zeichen)</Label>
                <Input id="neu" type="password" autoComplete="new-password" value={neu} onChange={(e) => setNeu(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="neu2">Neue PIN bestätigen</Label>
                <Input id="neu2" type="password" autoComplete="new-password" value={neu2} onChange={(e) => setNeu2(e.target.value)} />
              </div>
            </div>
            <MeldungBox m={pinMeldung} />
            <div>
              <Button type="submit" disabled={busy || !alt || !neu || !neu2}>
                PIN ändern
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Überall abmelden</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Meldet dich auf allen Geräten ab, auch hier. Danach ist eine neue Anmeldung nötig.
          </p>
          <MeldungBox m={abmeldenMeldung} />
          <div>
            <Button variant="destructive" onClick={ueberallAbmelden} disabled={busy}>
              Überall abmelden
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
