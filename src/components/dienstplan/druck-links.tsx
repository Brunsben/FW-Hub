"use client";

import { useState } from "react";
import { FileText, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

// Links auf PDF und Bild (Spec 9.2, 9.3, Phase 11). Öffnen im neuen Tab: Der
// Browser zeigt das PDF an; das Bild lässt sich auf dem Handy lange drücken und
// „Zu Fotos hinzufügen“ (Sperrbildschirm). halbjahr "" = ganzes Jahr (nur PDF).
export function DruckLinks({ jahr, halbjahr }: { jahr: number; halbjahr: string }) {
  const [dunkel, setDunkel] = useState(false);
  const [namen, setNamen] = useState(false);
  const basis = `/api/dienstplan/plaene/${jahr}/export`;
  const bildHalbjahr = halbjahr || "1";
  const bild = `${basis}/bild?halbjahr=${bildHalbjahr}&thema=${dunkel ? "dunkel" : "hell"}&namen=${namen ? 1 : 0}`;
  return (
    <div className="grid gap-3">
      <Button variant="outline" asChild>
        <a href={`${basis}/pdf${halbjahr ? `?halbjahr=${halbjahr}` : ""}`} target="_blank" rel="noopener"><FileText /> PDF zum Ausdrucken</a>
      </Button>
      <div className="grid gap-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={dunkel} onChange={(e) => setDunkel(e.target.checked)} />dunkel</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={namen} onChange={(e) => setNamen(e.target.checked)} />mit Verantwortlichen</label>
        </div>
        <Button variant="outline" asChild>
          <a href={bild} target="_blank" rel="noopener" data-testid="bild-link"><Smartphone /> Bild fürs Handy ({bildHalbjahr}. Halbjahr)</a>
        </Button>
        <p className="text-xs text-muted-foreground">Auf dem Handy das Bild lange drücken und in Fotos sichern, z. B. als Sperrbildschirm.</p>
      </div>
    </div>
  );
}
