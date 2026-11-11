// API-Aufrufe der Dienstplan-Oberfläche. Liefert nie eine Exception, sondern
// { ok, data } oder { ok: false, message } mit der Meldung der API.
export type ApiErgebnis<T> = { ok: true; data: T } | { ok: false; message: string };

export async function dpApi<T = unknown>(method: string, pfad: string, body?: unknown): Promise<ApiErgebnis<T>> {
  try {
    const res = await fetch(`/api/dienstplan${pfad}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, message: (data as { error?: string }).error ?? `Fehler ${res.status}` };
  } catch {
    return { ok: false, message: "Netzwerkfehler" };
  }
}

export type DateiAntwort = { dateiname: string; mime: string; inhalt: string };

/** Datei aus einer Export-Antwort (Base64) im Browser speichern. */
export function speichereDatei(d: DateiAntwort) {
  const bin = atob(d.inhalt);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: d.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = d.dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
