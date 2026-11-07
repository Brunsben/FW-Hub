// SQLSTATE aus einem Datenbankfehler lesen. Drizzle verpackt den Fehler von
// postgres-js (Feld `code`) in einen Wrapper mit `cause`, daher beide Ebenen
// prüfen.
export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 3 && cur && typeof cur === "object"; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_INSUFFICIENT_PRIVILEGE = "42501";
export const PG_NO_DATA_FOUND = "P0002";
