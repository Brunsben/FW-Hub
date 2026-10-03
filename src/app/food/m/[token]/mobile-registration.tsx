"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  user: { name: string; personalNumber: string | null };
  menu: {
    description: string;
    zweiMenuesAktiv: boolean;
    menu1Name: string | null;
    menu2Name: string | null;
    registrationDeadline: string;
    deadlineEnabled: boolean;
  } | null;
  initialRegistration: { menuChoice: number } | null;
}

export function MobileRegistration({ user, menu, initialRegistration }: Props) {
  const router = useRouter();
  const [registration, setRegistration] = useState(initialRegistration);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const show = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  async function register(choice: number) {
    if (!user.personalNumber) return;
    setLoading(true);
    try {
      const res = await fetch("/api/food/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personal_number: user.personalNumber,
          menu_choice: choice,
        }),
      });
      const data = await res.json();
      if (res.ok && data.registered) {
        setRegistration({ menuChoice: choice });
        show("success", "Anmeldung erfolgreich");
        router.refresh();
      } else {
        show("error", data.error || "Fehler bei der Anmeldung");
      }
    } catch {
      show("error", "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  async function unregister() {
    if (!user.personalNumber) return;
    setLoading(true);
    try {
      const res = await fetch("/api/food/register", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personal_number: user.personalNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegistration(null);
        show("success", "Abmeldung erfolgreich");
        router.refresh();
      } else {
        show("error", data.error || "Fehler");
      }
    } catch {
      show("error", "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">{user.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {menu ? (
            <div className="rounded-xl bg-muted p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Heutiges Menü
              </p>
              <p className="mt-1">{menu.description}</p>
              {menu.zweiMenuesAktiv && (
                <div className="mt-2 flex justify-center gap-2 text-xs">
                  <Badge variant="secondary">
                    1: {menu.menu1Name || "Standard"}
                  </Badge>
                  <Badge variant="secondary">
                    2: {menu.menu2Name || "Alternativ"}
                  </Badge>
                </div>
              )}
              {menu.deadlineEnabled && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Anmeldeschluss: {menu.registrationDeadline} Uhr
                </p>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Kein Menü für heute eingetragen
            </p>
          )}

          {!user.personalNumber ? (
            <p className="text-center text-sm text-destructive">
              Für diesen Kameraden ist keine Personalnummer hinterlegt – eine
              Anmeldung ist darüber nicht möglich.
            </p>
          ) : registration ? (
            <div className="flex flex-col gap-3">
              <p className="text-center font-medium text-green-600">
                Angemeldet
                {menu?.zweiMenuesAktiv
                  ? ` (Menü ${registration.menuChoice})`
                  : ""}
              </p>
              <Button
                type="button"
                variant="destructive"
                onClick={unregister}
                disabled={loading}
              >
                Abmelden
              </Button>
            </div>
          ) : menu?.zweiMenuesAktiv ? (
            <div className="flex gap-3">
              <Button
                type="button"
                className="h-16 flex-1"
                onClick={() => register(1)}
                disabled={loading}
              >
                {menu.menu1Name || "Menü 1"}
              </Button>
              <Button
                type="button"
                className="h-16 flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => register(2)}
                disabled={loading}
              >
                {menu.menu2Name || "Menü 2"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="h-16"
              onClick={() => register(1)}
              disabled={loading}
            >
              Anmelden
            </Button>
          )}

          {message && (
            <p
              className={`text-center text-sm ${
                message.type === "success"
                  ? "text-green-600"
                  : "text-destructive"
              }`}
            >
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
