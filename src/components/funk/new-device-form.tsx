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
import {
  DEVICE_STATUS,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPES,
  DEVICE_TYPE_LABELS,
  type DeviceStatus,
  type DeviceType,
} from "@/lib/funk-labels";

export function NewDeviceForm() {
  const router = useRouter();
  const [serialNumber, setSerialNumber] = useState("");
  const [deviceType, setDeviceType] = useState<DeviceType>("sepura");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<DeviceStatus>("active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/funk/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumber: serialNumber.trim(),
          deviceType,
          model: model.trim() || null,
          status,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Anlegen fehlgeschlagen");
      }
      setSerialNumber("");
      setModel("");
      setDeviceType("sepura");
      setStatus("active");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="serialNumber">Seriennummer</Label>
        <Input
          id="serialNumber"
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="model">Modell (optional)</Label>
        <Input
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label>Typ</Label>
        <Select
          value={deviceType}
          onValueChange={(v) => setDeviceType(v as DeviceType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEVICE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DEVICE_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Status</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as DeviceStatus)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEVICE_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {DEVICE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive sm:col-span-2">{error}</p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={submitting || !serialNumber.trim()}>
          {submitting ? "Wird angelegt…" : "Gerät anlegen"}
        </Button>
      </div>
    </form>
  );
}
