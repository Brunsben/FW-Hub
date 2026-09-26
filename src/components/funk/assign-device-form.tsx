"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { DEVICE_TYPE_LABELS, type DeviceType } from "@/lib/funk-labels";

export interface AssignableDevice {
  id: string;
  serialNumber: string;
  deviceType: DeviceType;
}

export interface KameradOption {
  id: number;
  label: string;
}

export function AssignDeviceForm({
  devices,
  kameraden,
}: {
  devices: AssignableDevice[];
  kameraden: KameradOption[];
}) {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/funk/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          ownerId: Number(ownerId),
          expectedReturnDate: expectedReturnDate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Zuteilung fehlgeschlagen");
      }
      setDeviceId("");
      setOwnerId("");
      setExpectedReturnDate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  if (devices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aktuell sind keine freien Geräte für eine Zuteilung verfügbar.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label>Gerät</Label>
        <Select value={deviceId} onValueChange={setDeviceId}>
          <SelectTrigger>
            <SelectValue placeholder="Freies Gerät wählen" />
          </SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.serialNumber} · {DEVICE_TYPE_LABELS[d.deviceType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Kamerad</Label>
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger>
            <SelectValue placeholder="Kamerad wählen" />
          </SelectTrigger>
          <SelectContent>
            {kameraden.map((k) => (
              <SelectItem key={k.id} value={String(k.id)}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="expectedReturnDate">
          Erwartete Rückgabe (optional)
        </Label>
        <Input
          id="expectedReturnDate"
          type="date"
          value={expectedReturnDate}
          onChange={(e) => setExpectedReturnDate(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive sm:col-span-2">{error}</p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={submitting || !deviceId || !ownerId}>
          {submitting ? "Wird zugeteilt…" : "Gerät zuteilen"}
        </Button>
      </div>
    </form>
  );
}
