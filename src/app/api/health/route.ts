// Öffentlicher Healthcheck für Docker und Uptime Kuma: kein Datenbankzugriff, keine Details.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}