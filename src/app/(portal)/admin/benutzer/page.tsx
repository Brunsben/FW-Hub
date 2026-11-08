import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Alte Adresse der Benutzerverwaltung. Accounts, PINs und Rollen liegen jetzt in
// der zentralen Mitgliederverwaltung unter /mitglieder. Ohne Anmeldung wie
// bisher direkt zum Login, sonst weiter zur Liste (dort entscheidet die Rolle).
export default async function AdminBenutzerWeiterleitung() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  redirect("/mitglieder");
}
