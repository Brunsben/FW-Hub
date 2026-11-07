import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

// Logout: löscht das Auth-Cookie. Bewusst nur POST — ein GET-Logout ließe sich
// per <img src> oder Link von fremden Seiten auslösen. Andere Methoden
// beantwortet Next.js automatisch mit 405.
//
// Grenze: Das JWT selbst bleibt bis exp gültig, falls es kopiert wurde
// (serverseitiger Widerruf → Vorschlag für Stufe 3).
export async function POST(req: NextRequest) {
  const isHttps = req.headers.get("x-forwarded-proto") === "https";
  await clearAuthCookie(isHttps);
  return NextResponse.json({ ok: true });
}
