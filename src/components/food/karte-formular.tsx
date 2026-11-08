"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiCall, type Meldung } from "@/components/mitglieder/api-client";

// Küche-Abschnitt der Mitgliederseite: Karten-ID und QR-Link zur mobilen
// Anmeldung. Die Karten-ID schreibt ausschließlich core.set_karten_id
// (über PUT /api/food/admin/users/[id]).
//
// Scan: Der Kartenleser meldet sich als Tastatur (HID). "Karte scannen"
// fokussiert das Feld; der Leser tippt die ID und schließt mit Enter ab, das
// Formular speichert dann sofort. Ohne Leser lässt sich die ID auch eintippen.
export function KarteFormular({
  kameradId,
  kameradName,
  kartenId,
}: {
  kameradId: number;
  kameradName: string;
  kartenId: string | null;
}) {
  const router = useRouter();
  const feld = useRef<HTMLInputElement>(null);
  const [wert, setWert] = useState(kartenId ?? "");
  const [bereit, setBereit] = useState(false);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [busy, setBusy] = useState<"speichern" | "entfernen" | "qr" | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  async function senden(neu: string | null, art: "speichern" | "entfernen") {
    setBusy(art);
    const r = await apiCall("PUT", `/api/food/admin/users/${kameradId}`, { card_id: neu });
    setBusy(null);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: neu ? "Karten-ID gespeichert." : "Karten-ID entfernt." });
    if (!neu) setWert("");
    setBereit(false);
    router.refresh();
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault();
    const v = wert.trim();
    if (!v) return setMeldung({ ok: false, text: "Bitte eine Karten-ID eingeben oder scannen." });
    return senden(v, "speichern");
  }

  function entfernen() {
    if (!window.confirm(`Karten-ID von ${kameradName} entfernen?`)) return;
    return senden(null, "entfernen");
  }

  function scanStarten() {
    setMeldung(null);
    setWert("");
    setBereit(true);
    feld.current?.focus();
  }

  async function qrErzeugen() {
    if (qr && !window.confirm("Ein neuer QR-Link macht den bisherigen ungültig. Fortfahren?")) return;
    setBusy("qr");
    const r = await apiCall("POST", "/api/food/admin/mobile-token", { kameradId });
    setBusy(null);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setQr(`${window.location.origin}${(r.data as { url: string }).url}`);
    setMeldung(null);
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={speichern} className="grid gap-3">
        <Label htmlFor="karten-id">Karten-ID</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="karten-id"
            ref={feld}
            value={wert}
            autoComplete="off"
            inputMode="text"
            placeholder={bereit ? "Bereit: Karte an den Leser halten …" : "Karten-ID"}
            className={"max-w-xs " + (bereit ? "border-primary ring-[3px] ring-ring/80" : "")}
            onChange={(e) => setWert(e.target.value)}
            onBlur={() => {
              // Scan abgebrochen (Feld leer verlassen): die gespeicherte ID wieder anzeigen,
              // sonst sieht es aus, als wäre sie weg.
              if (bereit && wert.trim() === "") setWert(kartenId ?? "");
              setBereit(false);
            }}
          />
          <Button type="button" variant="outline" onClick={scanStarten}>
            <ScanLine aria-hidden /> Karte scannen
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy === "speichern"} disabled={wert.trim() === (kartenId ?? "")}>
            Speichern
          </Button>
          {kartenId && (
            <Button type="button" variant="ghost" loading={busy === "entfernen"} onClick={entfernen}>
              Karten-ID entfernen
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Der Kartenleser speichert nach dem Scan mit Enter.
          </span>
        </div>
        {meldung && (
          <p role={meldung.ok ? "status" : "alert"} className={meldung.ok ? "text-sm text-success" : "text-sm text-destructive"}>
            {meldung.text}
          </p>
        )}
      </form>

      <div className="grid gap-3 border-t pt-4">
        <h3 className="text-sm font-medium">QR-Link zur mobilen Anmeldung</h3>
        <p className="text-sm text-muted-foreground">
          Mit dem Link meldet sich {kameradName} am Handy zum Essen an. Ein neuer Link ersetzt den alten.
        </p>
        <div>
          <Button type="button" variant="outline" loading={busy === "qr"} onClick={qrErzeugen}>
            QR-Link erzeugen
          </Button>
        </div>
        {qr && (
          <div className="grid gap-3 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Input readOnly value={qr} className="min-w-0 flex-1" aria-label="QR-Link" />
              <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(qr)}>
                Kopieren
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setQr(null)}>
                Schließen
              </Button>
            </div>
            {/* Bewusst fest weiß (kein Theme-Token): Ein QR-Code braucht eine
                helle Ruhezone mit dunklen Modulen, sonst ist er im Dunkelmodus
                nicht scanbar. */}
            <div className="w-fit rounded-lg bg-white p-4">
              <QRCodeSVG value={qr} size={192} bgColor="#ffffff" fgColor="#000000" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
