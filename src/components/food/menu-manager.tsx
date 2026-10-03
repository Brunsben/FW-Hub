"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MenuRow {
  date: string;
  description: string;
  zweiMenuesAktiv: boolean;
  menu1Name: string | null;
  menu2Name: string | null;
  registrationDeadline: string;
  deadlineEnabled: boolean;
}

export interface PresetOption {
  id: number;
  name: string;
}

const DEFAULTS = {
  description: "",
  zweiMenuesAktiv: false,
  menu1Name: "",
  menu2Name: "",
  registrationDeadline: "19:45",
  deadlineEnabled: true,
};

export function MenuManager({
  menus,
  presets,
  today,
}: {
  menus: MenuRow[];
  presets: PresetOption[];
  today: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [form, setForm] = useState({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formular an das Menü des gewählten Datums angleichen (oder leeren).
  useEffect(() => {
    const existing = menus.find((m) => m.date === date);
    if (existing) {
      setForm({
        description: existing.description,
        zweiMenuesAktiv: existing.zweiMenuesAktiv,
        menu1Name: existing.menu1Name ?? "",
        menu2Name: existing.menu2Name ?? "",
        registrationDeadline: existing.registrationDeadline,
        deadlineEnabled: existing.deadlineEnabled,
      });
    } else {
      setForm({ ...DEFAULTS });
    }
  }, [date, menus]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/food/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          description: form.description.trim(),
          zwei_menues_aktiv: form.zweiMenuesAktiv,
          menu1_name: form.menu1Name.trim() || null,
          menu2_name: form.menu2Name.trim() || null,
          registration_deadline: form.registrationDeadline,
          deadline_enabled: form.deadlineEnabled,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Speichern fehlgeschlagen");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Menü-Pflege</CardTitle>
        <CardDescription>
          Heutiges oder kommendes Menü anlegen/bearbeiten.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="menu-date">Datum</Label>
            <Input
              id="menu-date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Voreinstellung übernehmen</Label>
            <Select
              onValueChange={(v) => setForm({ ...form, description: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Voreinstellung wählen" />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.id} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="menu-description">Beschreibung</Label>
            <Input
              id="menu-description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.zweiMenuesAktiv}
              onChange={(e) =>
                setForm({ ...form, zweiMenuesAktiv: e.target.checked })
              }
            />
            Zwei-Menü-Modus aktiv
          </label>

          {form.zweiMenuesAktiv && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="menu1">Menü 1 – Name</Label>
                <Input
                  id="menu1"
                  value={form.menu1Name}
                  onChange={(e) =>
                    setForm({ ...form, menu1Name: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="menu2">Menü 2 – Name</Label>
                <Input
                  id="menu2"
                  value={form.menu2Name}
                  onChange={(e) =>
                    setForm({ ...form, menu2Name: e.target.value })
                  }
                />
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="deadline">Anmeldeschluss</Label>
            <Input
              id="deadline"
              type="time"
              value={form.registrationDeadline}
              onChange={(e) =>
                setForm({ ...form, registrationDeadline: e.target.value })
              }
            />
          </div>

          <label className="flex h-9 items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={form.deadlineEnabled}
              onChange={(e) =>
                setForm({ ...form, deadlineEnabled: e.target.checked })
              }
            />
            Anmeldeschluss aktiv
          </label>

          {error && (
            <p className="text-sm text-destructive sm:col-span-2">{error}</p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving || !form.description.trim()}>
              {saving ? "Speichert…" : "Menü speichern"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
