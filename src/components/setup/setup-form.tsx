"use client";

import { useState } from "react";
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

const MIN_PIN = 6;

export function SetupForm() {
  const router = useRouter();
  const [vorname, setVorname] = useState("");
  const [name, setName] = useState("");
  const [benutzername, setBenutzername] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin.length < MIN_PIN) return setError(`PIN muss mindestens ${MIN_PIN} Zeichen lang sein.`);
    if (pin !== pin2) return setError("PIN und Bestätigung stimmen nicht überein.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vorname: vorname.trim(),
          name: name.trim(),
          benutzername: benutzername.trim(),
          pin,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`Fehler ${res.status}: ${data.error ?? "Einrichtung fehlgeschlagen"}`);
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>FW-Hub einrichten</CardTitle>
        <CardDescription>
          Legt den ersten Administrator samt Kameraden-Datensatz an. Danach ist
          diese Seite nicht mehr erreichbar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="vorname">Vorname</Label>
              <Input id="vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="benutzername">Benutzername</Label>
            <Input id="benutzername" autoComplete="username" value={benutzername} onChange={(e) => setBenutzername(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pin">PIN (mind. {MIN_PIN} Zeichen)</Label>
              <Input id="pin" type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pin2">PIN bestätigen</Label>
              <Input id="pin2" type="password" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} required />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Richte ein …" : "Einrichten"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
