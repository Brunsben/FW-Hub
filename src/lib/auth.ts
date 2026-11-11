import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { authDb } from "@/lib/db/auth-client";
import { benutzer } from "@/lib/db/schema";

const COOKIE_NAME = "fw_jwt";
const COOKIE_MAX_AGE = 28800; // 8 Stunden, passend zur JWT-Laufzeit
const TOKEN_TTL = "8h";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("FATAL: JWT_SECRET ist nicht gesetzt");
  return new TextEncoder().encode(secret);
}

export interface JwtPayload {
  sub: string;
  app_role: string;
  benutzer_id: number; // core.benutzer.id
  tv: number; // core.benutzer.token_version zum Ausstellungszeitpunkt
  kamerad_id: number; // niemals null — durch NOT-NULL-Constraint garantiert
  kamerad_name: string;
  email?: string;
  psa_rolle?: string | null;
  food_rolle?: string | null;
  fk_rolle?: string | null;
  funk_rolle?: string | null;
  dienst_rolle?: string | null;
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getJwtSecret());
}

/** Verifiziert Signatur UND erzwingt den exp-Claim (requiredClaims). */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      requiredClaims: ["exp"],
    });
    if (typeof payload.kamerad_id !== "number") return null;
    // Tokens ohne benutzer_id/tv (z. B. vor Einführung von token_version
    // ausgestellt) sind ungültig.
    if (!Number.isInteger(payload.benutzer_id) || !Number.isInteger(payload.tv))
      return null;
    return {
      sub: payload.sub as string,
      app_role: payload.app_role as string,
      benutzer_id: payload.benutzer_id as number,
      tv: payload.tv as number,
      kamerad_id: payload.kamerad_id,
      kamerad_name: payload.kamerad_name as string,
      email: payload.email as string | undefined,
      psa_rolle: payload.psa_rolle as string | null | undefined,
      food_rolle: payload.food_rolle as string | null | undefined,
      fk_rolle: payload.fk_rolle as string | null | undefined,
      funk_rolle: payload.funk_rolle as string | null | undefined,
      dienst_rolle: payload.dienst_rolle as string | null | undefined,
    };
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string, isHttps: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearAuthCookie(isHttps: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: 0,
  });
}

// Verifiziert das JWT und prüft danach live gegen core.benutzer (über authDb,
// fw_auth hat SELECT): Benutzer aktiv, token_version unverändert, kamerad_id
// und Rolle stimmen. So wirken Deaktivierung, PIN-/Rollenänderung und
// "überall abmelden" beim nächsten Request, nicht erst bei exp.
export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyJwt(token);
  if (!payload) return null;

  const [row] = await authDb
    .select({
      aktiv: benutzer.aktiv,
      tokenVersion: benutzer.tokenVersion,
      kameradId: benutzer.kameradId,
      rolle: benutzer.rolle,
    })
    .from(benutzer)
    .where(eq(benutzer.id, payload.benutzer_id))
    .limit(1);

  if (
    !row ||
    !row.aktiv ||
    row.tokenVersion !== payload.tv ||
    row.kameradId !== payload.kamerad_id ||
    row.rolle !== payload.app_role
  ) {
    return null;
  }
  return payload;
}

export function isGlobalAdmin(user: JwtPayload | null): boolean {
  return user?.app_role === "Admin";
}
