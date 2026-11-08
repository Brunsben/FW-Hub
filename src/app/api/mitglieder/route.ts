import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import { kameradenStammdaten } from "@/lib/db/kameraden-stamm";
import {
  BenutzerKonflikt,
  konfliktResponse,
  MIN_PIN_LAENGE,
  requireGlobalAdmin,
} from "@/lib/benutzer-admin";
import { filtereMitglieder, ladeMitglied, listeMitglieder } from "@/lib/mitglieder/lesen";
import { kannMitgliederSehen, kannZugangSehenUndBearbeiten } from "@/lib/mitglieder/rechte";
import { pruefeLogin, pruefeStammdaten } from "@/lib/mitglieder/validierung";
import { constraintName, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/db/pg-error";

// Mitgliederliste. Sehen darf jede Verwaltungsrolle (globaler Admin, PSA Admin/
// Kleiderwart, Küchen-Admin, Funk Admin/Gerätewart). Welche Felder je Rolle
// enthalten sind, bestimmt die Projektion in lib/mitglieder/lesen.ts:
// Zugang und Rollen nur für globale Admins, Karten-ID nur für Küchen-Admins.
//   GET ?suche=<text>&status=alle|aktiv|inaktiv|ohne-login
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!kannMitgliederSehen(user)) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const status = p.get("status") ?? "alle";
  if (!["alle", "aktiv", "inaktiv", "ohne-login"].includes(status)) {
    return NextResponse.json({ error: "Ungültiger Status-Filter" }, { status: 400 });
  }
  if (status === "ohne-login" && !kannZugangSehenUndBearbeiten(user)) {
    return NextResponse.json(
      { error: "Der Filter 'ohne Login' ist nur für Administratoren verfügbar" },
      { status: 400 },
    );
  }

  const liste = await listeMitglieder(user);
  const mitglieder = filtereMitglieder(liste, {
    suche: p.get("suche") ?? undefined,
    status: status as "alle" | "aktiv" | "inaktiv" | "ohne-login",
  });
  return NextResponse.json({ mitglieder });
}

// Neues Mitglied anlegen, optional mit Login, in EINER Transaktion (nur globaler
// Admin). Kameraden werden nie gelöscht; Rollen vergibt man danach getrennt
// (/api/admin/rollen), die Karten-ID die Küche (set_karten_id).
//   Body: { vorname, name, dienstgrad?, email?, personalnummer?, aktiv?,
//           login?: { benutzername, pin, rolle? } }
export async function POST(req: NextRequest) {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const stamm = pruefeStammdaten(body, "anlegen");
  if (!stamm.ok) return NextResponse.json({ error: stamm.fehler }, { status: 400 });
  const rohLogin = (body as Record<string, unknown>).login;
  const login = rohLogin === undefined || rohLogin === null ? null : pruefeLogin(rohLogin, MIN_PIN_LAENGE);
  if (login && !login.ok) return NextResponse.json({ error: login.fehler }, { status: 400 });
  const pinHash = login?.ok ? await hash(login.daten.pin, 12) : null;

  try {
    const id = await withGlobalAdminScope(guard.user, async (tx) => {
      if (login?.ok) {
        const [belegt] = await tx
          .select({ id: benutzer.id })
          .from(benutzer)
          .where(sql`lower(${benutzer.benutzername}) = lower(${login.daten.benutzername})`)
          .limit(1);
        if (belegt) throw new BenutzerKonflikt("Benutzername ist bereits vergeben.");
      }
      const [angelegt] = await tx
        .insert(kameradenStammdaten)
        .values({
          vorname: stamm.daten.vorname!,
          name: stamm.daten.name!,
          dienstgrad: stamm.daten.dienstgrad ?? null,
          email: stamm.daten.email ?? null,
          personalnummer: stamm.daten.personalnummer ?? null,
          aktiv: stamm.daten.aktiv ?? true,
        })
        .returning({ id: kameraden.id });
      if (login?.ok && pinHash) {
        await tx.insert(benutzer).values({
          benutzername: login.daten.benutzername,
          pin: pinHash,
          rolle: login.daten.rolle,
          kameradId: angelegt.id,
          aktiv: true,
        });
      }
      return angelegt.id;
    });
    const mitglied = await ladeMitglied(guard.user, id);
    return NextResponse.json({ mitglied }, { status: 201 });
  } catch (e) {
    const konflikt = konfliktResponse(e);
    if (konflikt) return konflikt;
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      const name = constraintName(e) ?? "";
      const text = name.includes("personalnummer")
        ? "Personalnummer ist bereits vergeben."
        : name.includes("benutzername")
          ? "Benutzername ist bereits vergeben."
          : "Eintrag existiert bereits.";
      return NextResponse.json({ error: text }, { status: 409 });
    }
    throw e;
  }
}
