"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Abmelden-Knopf (Kopfzeile und Handy-Menü). className erlaubt größere
// Touch-Flächen im Handy-Menü.
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={logout}
      loading={busy}
    >
      Abmelden
    </Button>
  );
}
