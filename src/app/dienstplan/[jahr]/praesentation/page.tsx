import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Praesentation } from "@/components/dienstplan/praesentation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dienstplan – Präsentation",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Präsentationsansicht (Spec 7.3), bewusst außerhalb des Portalrahmens (keine
// Kopfzeile, wie der Kiosk /food). Die Seite selbst enthält keine Daten und
// prüft keinen Login: Die Daten holt die Client-Komponente entweder mit dem
// Anzeige-Token aus dem Fragment (#t=…) über /api/dienstplan/anzeige/[jahr]
// oder mit der eigenen Anmeldung über /api/dienstplan/plaene/[jahr]. Beide
// Routen prüfen selbst (401/403).
export default async function PraesentationPage({ params, searchParams }: {
  params: Promise<{ jahr: string }>;
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const jahr = Number((await params).jahr);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) notFound();
  const { ansicht } = await searchParams;
  return <Praesentation jahr={jahr} ansichtParam={ansicht ?? null} />;
}
