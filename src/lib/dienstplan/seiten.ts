import { redirect } from "next/navigation";
import { requireDienstplanSession, type DienstplanSession, type DienstRolle } from "@/lib/dienstplan/auth";

const RANG: Record<DienstRolle, number> = { Mitglied: 0, Planer: 1, Admin: 2 };

// Seiten-Gegenstück zu dienstplanRoute: ohne Session → /login, unter der
// Mindestrolle (z. B. Planung/Verwaltung ohne Planer- oder Admin-Rolle) →
// Startseite mit Hinweis „Kein Zugriff auf das Modul Dienstplan“. Durchgesetzt
// wird in der Datenbank; das hier verhindert nur leere Seiten.
export async function requireDienstplanSeite(mindestens: DienstRolle): Promise<DienstplanSession> {
  const s = await requireDienstplanSession();
  if (!s) redirect("/login");
  if (RANG[s.rolle] < RANG[mindestens]) redirect("/?kein_zugriff=dienstplan");
  return s;
}
