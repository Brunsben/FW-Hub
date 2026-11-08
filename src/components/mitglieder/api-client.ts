// API-Aufruf aus den Mitglieder-Komponenten mit Anzeige der Fehlermeldung der
// API (400, 403, 409, 429, …). Gibt nie eine Exception zurück.
export async function apiCall(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data };
    const msg = (data as { error?: string }).error ?? "Unbekannter Fehler";
    return { ok: false, message: msg };
  } catch {
    return { ok: false, message: "Netzwerkfehler" };
  }
}

export interface Meldung {
  ok: boolean;
  text: string;
}

export const ABMELDE_HINWEIS =
  "Eine Rollenänderung, ein PIN-Reset oder eine Sperre meldet die Person beim nächsten Seitenaufruf ab. Neue Rollen gelten nach erneutem Login.";
