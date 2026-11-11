import { createHash, randomBytes } from "node:crypto";

// iCal-Abo (Spec 9.4, Migration 0022): geheime Abo-URL
// /api/dienstplan/abo/<token>.ics für Google-Kalender und DIVERA. Kalender-
// Dienste können keine Header schicken, darum steht das Token im Pfad. In der
// Datenbank steht nur der SHA-256-Hash; die URL sieht der Admin einmalig.

export function neuesAboToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashAboToken(token)! };
}

/** Hash aus dem Pfadteil (mit oder ohne ".ics"); null bei falschem Format. */
export function hashAboToken(roh: string | null | undefined): string | null {
  const token = (roh ?? "").replace(/\.ics$/i, "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export const aboPfad = (token: string) => `/api/dienstplan/abo/${token}.ics`;
