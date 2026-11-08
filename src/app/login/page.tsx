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
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [benutzername, setBenutzername] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benutzername: benutzername.trim(), pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Anmeldung fehlgeschlagen");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Anmeldung</CardTitle>
          <CardDescription>FW-Hub – Feuerwehr-Verwaltung</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="benutzername">Benutzername</Label>
              <Input
                id="benutzername"
                autoComplete="username"
                value={benutzername}
                onChange={(e) => setBenutzername(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="password"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              loading={submitting}
              disabled={!benutzername.trim() || !pin}
            >
              {submitting ? "Anmeldung läuft…" : "Anmelden"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
