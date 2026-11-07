"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const OPTIONEN = [
  { wert: "light", label: "Hell", Icon: Sun },
  { wert: "dark", label: "Dunkel", Icon: Moon },
  { wert: "system", label: "System", Icon: Monitor },
] as const;

// Auf dem Server ist das gewählte Theme unbekannt. Vor dem Mounten wird daher
// kein Knopf als aktiv markiert (verhindert einen Hydration-Mismatch).
const subscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

// Umschalter Hell / Dunkel / System. Nutzt nur vorhandene Bausteine
// (Button, lucide-react).
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <div
      data-theme-toggle
      role="group"
      aria-label="Farbschema"
      className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
    >
      {OPTIONEN.map(({ wert, label, Icon }) => {
        const aktiv = mounted && theme === wert;
        return (
          <Button
            key={wert}
            type="button"
            variant={aktiv ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={aktiv}
            aria-label={label}
            title={label}
            onClick={() => setTheme(wert)}
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );
}
