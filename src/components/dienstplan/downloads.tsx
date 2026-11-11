"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { dpApi, speichereDatei, type DateiAntwort } from "@/components/dienstplan/api";
import { DruckLinks } from "@/components/dienstplan/druck-links";

// Downloads für Mitglieder (Spec 7.4): Kalender (.ics), PDF und Bild für das
// Smartphone, für Halbjahr oder Jahr (Bild nur je Halbjahr).
export function Downloads({ jahr }: { jahr: number }) {
  const heute = new Date();
  const [halbjahr, setHalbjahr] = useState<string>(heute.getFullYear() === jahr ? (heute.getMonth() < 6 ? "1" : "2") : "1");
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function ics() {
    setBusy("ics");
    setFehler(null);
    const r = await dpApi<DateiAntwort>("POST", `/plaene/${jahr}/export/ics`, halbjahr ? { halbjahr: Number(halbjahr) } : {});
    setBusy(null);
    if (r.ok) speichereDatei(r.data); else setFehler(r.message);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Herunterladen</CardTitle>
        <CardDescription>Plan {jahr} für Kalender, Ausdruck und Handy.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="dl-halbjahr">Zeitraum</Label>
          <select id="dl-halbjahr" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={halbjahr} onChange={(e) => setHalbjahr(e.target.value)}>
            <option value="1">1. Halbjahr</option><option value="2">2. Halbjahr</option><option value="">ganzes Jahr</option>
          </select>
        </div>
        <Button variant="outline" loading={busy === "ics"} onClick={() => void ics()}><CalendarPlus /> Kalender (.ics)</Button>
        <DruckLinks jahr={jahr} halbjahr={halbjahr} />
        {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      </CardContent>
    </Card>
  );
}
