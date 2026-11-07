"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Vorläufiger Logout-Button bis zur Portal-Shell (Stufe 4).
export function LogoutButton() {
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
    <Button variant="outline" size="sm" onClick={logout} disabled={busy}>
      Abmelden
    </Button>
  );
}
