import { redirect } from "next/navigation";
import { benutzerVorhanden } from "@/lib/setup-status";
import { SetupForm } from "@/components/setup/setup-form";
import { ThemeToggle } from "@/components/theme-toggle";

// Erst-Einrichtung: nur erreichbar, solange core.benutzer leer ist (Prüfung über
// authDb), sonst → /login. Die API /api/auth/setup prüft das unabhängig davon
// selbst noch einmal.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await benutzerVorhanden()) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <SetupForm />
    </main>
  );
}
