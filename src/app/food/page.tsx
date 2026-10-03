"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface DayStat {
  date: string;
  description: string;
  zweiMenuesAktiv: boolean;
  menu1: number;
  menu2: number;
  guests_menu1: number;
  guests_menu2: number;
  total: number;
}

type Identifier = { card_id?: string; personal_number?: string };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function FoodKioskPage() {
  const [stat, setStat] = useState<DayStat | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pending, setPending] = useState<{
    identifier: Identifier;
    menu1: string | null;
    menu2: string | null;
  } | null>(null);

  const scannerRef = useRef<HTMLInputElement>(null);

  const loadStat = useCallback(async () => {
    try {
      const res = await fetch("/api/food/stats?days=1");
      if (!res.ok) return;
      const data = await res.json();
      const todays =
        (data.stats as DayStat[]).find((s) => s.date === todayStr()) ?? null;
      setStat(todays);
    } catch {
      /* Kiosk bleibt bei Verbindungsfehler bestehen */
    }
  }, []);

  useEffect(() => {
    loadStat();
    const t = setInterval(loadStat, 10000);
    return () => clearInterval(t);
  }, [loadStat]);

  // Hält den versteckten Scanner-Input fokussiert, ohne manuelle Eingabe oder
  // Dialog-Buttons zu stören.
  const refocusScanner = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.id === "manual-input" || active.tagName === "BUTTON"))
      return;
    scannerRef.current?.focus();
  }, []);

  useEffect(() => {
    refocusScanner();
  }, [refocusScanner]);

  const showStatus = useCallback(
    (type: "success" | "error", message: string) => {
      setStatus({ type, message });
      setTimeout(() => setStatus(null), 3000);
    },
    [],
  );

  const doRegister = useCallback(
    async (identifier: Identifier, choice?: number) => {
      try {
        const res = await fetch("/api/food/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...identifier,
            ...(choice ? { menu_choice: choice } : {}),
          }),
        });
        const result = await res.json();

        // Zwei-Menü-Modus: API verlangt eine Auswahl → Dialog öffnen.
        if (res.ok && result.need_menu_choice) {
          setPending({
            identifier,
            menu1: result.menu1,
            menu2: result.menu2,
          });
          return;
        }

        if (res.ok) {
          const name = result.user?.name ?? "";
          showStatus(
            "success",
            result.registered
              ? `${name}: angemeldet`
              : `${name}: abgemeldet`,
          );
          setPending(null);
          loadStat();
        } else {
          showStatus("error", result.error ?? "Fehler bei der Anmeldung");
        }
      } catch {
        showStatus("error", "Verbindungsfehler");
      } finally {
        refocusScanner();
      }
    },
    [showStatus, loadStat, refocusScanner],
  );

  const processInput = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      // Nur Ziffern → Personalnummer, sonst Karten-ID.
      const identifier: Identifier = /^\d+$/.test(trimmed)
        ? { personal_number: trimmed }
        : { card_id: trimmed };
      doRegister(identifier);
    },
    [doRegister],
  );

  const handleScannerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processInput(scanValue);
      setScanValue("");
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processInput(manualInput);
    setManualInput("");
  };

  const handleMenuChoice = (choice: number) => {
    if (pending) {
      const { identifier } = pending;
      setPending(null);
      doRegister(identifier, choice);
    }
  };

  return (
    <main
      className="flex min-h-screen select-none flex-col items-center justify-center gap-6 p-6"
      onClick={refocusScanner}
    >
      {/* Verstecktes Scanner-Eingabefeld (HID-Tastatur-Emulation) */}
      <input
        ref={scannerRef}
        value={scanValue}
        onChange={(e) => setScanValue(e.target.value)}
        onKeyDown={handleScannerKeyDown}
        onBlur={() => setTimeout(refocusScanner, 100)}
        className="sr-only"
        aria-hidden
        autoFocus
        tabIndex={-1}
      />

      <div className="text-center">
        <h1 className="text-4xl font-bold">Essensanmeldung</h1>
        <p className="mt-1 text-2xl text-muted-foreground">
          {stat ? stat.menu1 + stat.menu2 : 0} Anmeldungen
        </p>
      </div>

      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>Heutiges Menü</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {stat ? (
            <>
              <p className="text-lg">{stat.description}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {stat.zweiMenuesAktiv && (
                  <>
                    <Badge variant="secondary">Menü 1: {stat.menu1}</Badge>
                    <Badge variant="secondary">Menü 2: {stat.menu2}</Badge>
                  </>
                )}
                <Badge variant="outline">
                  Gäste: {stat.guests_menu1 + stat.guests_menu2}
                </Badge>
                <Badge>Gesamt: {stat.total}</Badge>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Kein Menü für heute eingetragen
            </p>
          )}
        </CardContent>
      </Card>

      <div className="w-full max-w-lg rounded-2xl border-2 border-dashed p-8 text-center">
        <p className="text-xl font-medium">Karte an den Scanner halten</p>
        <p className="mt-1 text-sm text-muted-foreground">RFID / Barcode</p>
      </div>

      <form onSubmit={handleManualSubmit} className="flex w-full max-w-lg gap-3">
        <Input
          id="manual-input"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Personalnummer eingeben…"
          className="h-14 flex-1 text-xl"
        />
        <Button type="submit" size="lg" className="h-14 px-8 text-xl">
          OK
        </Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => document.documentElement.requestFullscreen?.()}
      >
        Vollbild
      </Button>

      {status && (
        <div
          className={`fixed left-1/2 top-8 z-50 -translate-x-1/2 rounded-xl px-8 py-4 text-xl font-semibold text-white shadow-2xl ${
            status.type === "success" ? "bg-green-600" : "bg-destructive"
          }`}
        >
          {status.message}
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center text-2xl">
                Menü wählen
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-4">
                <Button
                  type="button"
                  size="lg"
                  className="h-24 flex-1 text-xl"
                  onClick={() => handleMenuChoice(1)}
                >
                  {pending.menu1 || "Menü 1"}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="h-24 flex-1 bg-green-600 text-xl hover:bg-green-700"
                  onClick={() => handleMenuChoice(2)}
                >
                  {pending.menu2 || "Menü 2"}
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPending(null)}
              >
                Abbrechen
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
