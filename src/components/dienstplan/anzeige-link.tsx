"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dpApi } from "@/components/dienstplan/api";

// Anzeige-Link für den Fernseher (Spec 6 und 7.3): gültig 12 Stunden, nur
// Lesen, nur dieser Plan, ohne Notizen. Das Token steht im URL-Fragment
// (#t=…), das nie an den Server geht. Es wird nur einmal angezeigt; wer den
// Link verliert, erzeugt einen neuen.
export function AnzeigeLink({ jahr }: { jahr: number }) {
  const [offen, setOffen] = useState(false);
  const [link, setLink] = useState<{ url: string; gueltigBis: string } | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [busy, setBusy] = useState<"neu" | "beenden" | null>(null);

  async function erzeugen() {
    setBusy("neu");
    setMeldung(null);
    const r = await dpApi<{ token: string; gueltigBis: string }>("POST", `/plaene/${jahr}/anzeige`);
    setBusy(null);
    if (!r.ok) { setMeldung(r.message); return; }
    setLink({ url: `${window.location.origin}/dienstplan/${jahr}/praesentation#t=${r.data.token}`, gueltigBis: r.data.gueltigBis });
  }

  async function beenden() {
    if (!window.confirm("Alle Anzeige-Links dieses Plans sofort beenden? Fernseher mit diesem Link zeigen danach nichts mehr an.")) return;
    setBusy("beenden");
    const r = await dpApi<{ beendet: number }>("DELETE", `/plaene/${jahr}/anzeige`);
    setBusy(null);
    setLink(null);
    setMeldung(r.ok ? `${r.data.beendet} Link(s) beendet.` : r.message);
  }

  const bis = link ? new Date(link.gueltigBis).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "";

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOffen(true)}><Tv /> Präsentation</Button>
      <Sheet open={offen} onOpenChange={setOffen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Präsentation {jahr}</SheetTitle>
            <SheetDescription>
              Live-Ansicht für den Fernseher. Der Anzeige-Link funktioniert ohne Anmeldung, 12 Stunden lang, nur für
              diesen Plan und ohne Notizen.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-6">
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Auf diesem Gerät</h3>
              <p className="text-sm text-muted-foreground">Zweites Fenster mit deiner Anmeldung, z. B. auf dem zweiten Bildschirm.</p>
              <Button variant="outline" asChild>
                <a href={`/dienstplan/${jahr}/praesentation`} target="_blank" rel="noopener"><ExternalLink /> In neuem Fenster öffnen</a>
              </Button>
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Fernseher ohne Anmeldung</h3>
              <Button onClick={erzeugen} loading={busy === "neu"}>{link ? "Neuen Anzeige-Link erzeugen" : "Anzeige-Link erzeugen"}</Button>
              {link && (
                <div className="grid gap-3 rounded-lg border border-border p-3">
                  <div className="mx-auto rounded-md bg-white p-3">
                    <QRCodeSVG value={link.url} size={208} level="M" aria-label="QR-Code des Anzeige-Links" />
                  </div>
                  <p className="break-all font-mono text-xs" data-testid="anzeige-url">{link.url}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={async () => {
                      try { await navigator.clipboard.writeText(link.url); setMeldung("Link kopiert."); } catch { setMeldung("Kopieren nicht möglich, Link bitte markieren."); }
                    }}><Copy /> Kopieren</Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Öffnen</a>
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Gültig bis {bis} Uhr. Der Link wird nur jetzt angezeigt.</p>
                </div>
              )}
              <Button variant="outline" onClick={beenden} loading={busy === "beenden"}>Alle Anzeige-Links beenden</Button>
            </div>
            {meldung && <p role="status" className="text-sm">{meldung}</p>}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
