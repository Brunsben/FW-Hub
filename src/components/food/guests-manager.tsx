"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GuestsManager({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [menu1, setMenu1] = useState(0);
  const [menu2, setMenu2] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/food/admin/guests?date=${d}`);
      if (!res.ok) return;
      const data = await res.json();
      setMenu1(data.guests?.menu1 ?? 0);
      setMenu2(data.guests?.menu2 ?? 0);
    } catch {
      /* Anzeige bleibt bestehen */
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const [menuChoice, count] of [
        [1, menu1],
        [2, menu2],
      ] as const) {
        const res = await fetch("/api/food/admin/guests", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, menu_choice: menuChoice, count }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Speichern fehlgeschlagen");
        }
      }
      await load(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gäste-Verwaltung</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="guests-date">Datum</Label>
            <Input
              id="guests-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guests-menu1">Gäste Menü 1</Label>
            <Input
              id="guests-menu1"
              type="number"
              min={0}
              value={menu1}
              onChange={(e) => setMenu1(Math.max(0, Number(e.target.value)))}
              className="w-28"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guests-menu2">Gäste Menü 2</Label>
            <Input
              id="guests-menu2"
              type="number"
              min={0}
              value={menu2}
              onChange={(e) => setMenu2(Math.max(0, Number(e.target.value)))}
              className="w-28"
            />
          </div>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Speichert…" : "Gäste speichern"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
