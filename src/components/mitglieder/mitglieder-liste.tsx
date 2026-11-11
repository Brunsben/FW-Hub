"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, MoreHorizontal, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiCall, type Meldung } from "./api-client";
import { KameradenImport } from "./kameraden-import";

export interface ListenEintrag {
  id: number;
  vorname: string;
  name: string;
  dienstgrad: string | null;
  personalnummer: string | null;
  aktiv: boolean;
  /** Nur für globale Admins: undefined = nicht sichtbar, null = kein Login. */
  zugang?: { benutzerId: number; benutzername: string; rolle: string; aktiv: boolean } | null;
}

type Status = "alle" | "aktiv" | "inaktiv" | "ohne-login";

export function MitgliederListe({
  mitglieder,
  istAdmin,
  eigeneId,
  eigeneBenutzerId,
  appRollen,
}: {
  mitglieder: ListenEintrag[];
  istAdmin: boolean;
  eigeneId: number;
  eigeneBenutzerId: number;
  appRollen: string[];
}) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState<Status>("aktiv");
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [importOffen, setImportOffen] = useState(false);

  const sichtbar = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return mitglieder.filter((m) => {
      if (status === "aktiv" && !m.aktiv) return false;
      if (status === "inaktiv" && m.aktiv) return false;
      if (status === "ohne-login" && m.zugang !== null) return false;
      if (!s) return true;
      return [`${m.vorname} ${m.name}`, `${m.name} ${m.vorname}`, m.personalnummer ?? "", m.dienstgrad ?? "", m.zugang?.benutzername ?? ""]
        .some((t) => t.toLowerCase().includes(s));
    });
  }, [mitglieder, suche, status]);

  async function aktion(
    frage: string,
    aufruf: () => ReturnType<typeof apiCall>,
    erfolg: string,
  ) {
    if (!window.confirm(frage)) return;
    const r = await aufruf();
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    setMeldung({ ok: true, text: erfolg });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {meldung && (
        <div
          role={meldung.ok ? "status" : "alert"}
          className={
            "rounded-xl border p-3 text-sm " +
            (meldung.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10")
          }
        >
          {meldung.text}
        </div>
      )}

      {istAdmin && neuOffen && (
        <NeuesMitglied
          appRollen={appRollen}
          onFertig={(id) => router.push(`/mitglieder/${id}`)}
          onAbbrechen={() => setNeuOffen(false)}
        />
      )}

      {istAdmin && importOffen && (
        <KameradenImport
          onFertig={(text) => { setImportOffen(false); setMeldung({ ok: true, text }); router.refresh(); }}
          onAbbrechen={() => setImportOffen(false)}
        />
      )}

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              Mitglieder{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({sichtbar.length} von {mitglieder.length})
              </span>
            </CardTitle>
            {istAdmin && !neuOffen && !importOffen && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setMeldung(null); setImportOffen(true); }}>
                  <FileUp aria-hidden /> CSV importieren
                </Button>
                <Button size="sm" onClick={() => setNeuOffen(true)}>
                  <Plus aria-hidden /> Neues Mitglied
                </Button>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="grid gap-2">
              <Label htmlFor="mitglieder-suche" className="sr-only">Suche</Label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="mitglieder-suche"
                  type="search"
                  placeholder="Suche nach Name, Personalnummer, Dienstgrad …"
                  className="pl-9"
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mitglieder-status" className="sr-only">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger id="mitglieder-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktive</SelectItem>
                  <SelectItem value="inaktiv">Inaktive</SelectItem>
                  {istAdmin && <SelectItem value="ohne-login">Ohne Login</SelectItem>}
                  <SelectItem value="alle">Alle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Dienstgrad</TableHead>
                <TableHead className="hidden md:table-cell">Personalnummer</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                {istAdmin && <TableHead className="hidden md:table-cell">Login</TableHead>}
                {istAdmin && <TableHead className="w-12 text-right"><span className="sr-only">Aktionen</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sichtbar.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={istAdmin ? 6 : 4} className="py-10 text-center text-muted-foreground">
                    Keine Mitglieder gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                sichtbar.map((m) => {
                  const voll = `${m.vorname} ${m.name}`;
                  const selbst = m.id === eigeneId;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link
                          href={`/mitglieder/${m.id}`}
                          title={voll}
                          className="block max-w-[11rem] truncate rounded-sm font-medium underline-offset-4 hover:underline sm:max-w-xs"
                        >
                          {m.name}, {m.vorname}
                        </Link>
                        {selbst && <span className="text-xs text-muted-foreground">(du)</span>}
                        <span className="block max-w-[11rem] truncate text-xs text-muted-foreground md:hidden">
                          {[m.dienstgrad, m.personalnummer].filter(Boolean).join(" · ")}
                        </span>
                        {/* Handy: Status unter dem Namen, damit Name und Aktionen-Knopf nebeneinander Platz haben */}
                        <Badge variant={m.aktiv ? "secondary" : "destructive"} className="mt-1 md:hidden">
                          {m.aktiv ? "aktiv" : "inaktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{m.dienstgrad ?? <span className="text-muted-foreground">–</span>}</TableCell>
                      <TableCell className="hidden md:table-cell">{m.personalnummer ?? <span className="text-muted-foreground">–</span>}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={m.aktiv ? "secondary" : "destructive"}>{m.aktiv ? "aktiv" : "inaktiv"}</Badge>
                      </TableCell>
                      {istAdmin && (
                        <TableCell className="hidden md:table-cell">
                          {m.zugang ? (
                            <span className="flex items-center gap-2">
                              <span className="max-w-[9rem] truncate" title={m.zugang.benutzername}>{m.zugang.benutzername}</span>
                              {m.zugang.rolle === "Admin" && <Badge>Admin</Badge>}
                              {!m.zugang.aktiv && <Badge variant="destructive">gesperrt</Badge>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">kein Login</span>
                          )}
                        </TableCell>
                      )}
                      {istAdmin && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Aktionen für ${voll}`}>
                                <MoreHorizontal aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel className="max-w-[14rem] truncate">{voll}</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link href={`/mitglieder/${m.id}`}>Details öffnen</Link>
                              </DropdownMenuItem>
                              {m.zugang ? (
                                <>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/mitglieder/${m.id}#zugang`}>PIN zurücksetzen …</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={m.zugang.benutzerId === eigeneBenutzerId && m.zugang.aktiv}
                                    onSelect={() => {
                                      const z = m.zugang!;
                                      return aktion(
                                        z.aktiv ? `Login ${z.benutzername} sperren? Die Person wird sofort abgemeldet.` : `Login ${z.benutzername} wieder freigeben?`,
                                        () => apiCall("PATCH", `/api/admin/benutzer/${z.benutzerId}`, { aktiv: !z.aktiv }),
                                        z.aktiv ? "Login gesperrt." : "Login entsperrt.",
                                      );
                                    }}
                                  >
                                    {m.zugang.aktiv ? "Login sperren" : "Login entsperren"}
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                m.aktiv && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/mitglieder/${m.id}#zugang`}>Login anlegen …</Link>
                                  </DropdownMenuItem>
                                )
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant={m.aktiv ? "destructive" : "default"}
                                disabled={selbst && m.aktiv}
                                onSelect={() =>
                                  aktion(
                                    m.aktiv
                                      ? `${voll} deaktivieren? Ein vorhandener Login wird dabei gesperrt.`
                                      : `${voll} wieder aktivieren? Der Login bleibt gesperrt, bis er unter "Zugang" freigegeben wird.`,
                                    () => apiCall("PATCH", `/api/mitglieder/${m.id}`, { aktiv: !m.aktiv }),
                                    m.aktiv ? "Mitglied deaktiviert." : "Mitglied aktiviert.",
                                  )
                                }
                              >
                                {m.aktiv ? "Mitglied deaktivieren" : "Mitglied aktivieren"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NeuesMitglied({
  appRollen,
  onFertig,
  onAbbrechen,
}: {
  appRollen: string[];
  onFertig: (id: number) => void;
  onAbbrechen: () => void;
}) {
  const [werte, setWerte] = useState({ vorname: "", name: "", dienstgrad: "", personalnummer: "", email: "" });
  const [mitLogin, setMitLogin] = useState(false);
  const [login, setLogin] = useState({ benutzername: "", pin: "", pin2: "", rolle: "User" });
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [busy, setBusy] = useState(false);

  async function anlegen(e: React.FormEvent) {
    e.preventDefault();
    if (mitLogin && login.pin !== login.pin2) return setMeldung({ ok: false, text: "Die PINs stimmen nicht überein." });
    setBusy(true);
    const r = await apiCall("POST", "/api/mitglieder", {
      ...werte,
      ...(mitLogin ? { login: { benutzername: login.benutzername.trim(), pin: login.pin, rolle: login.rolle } } : {}),
    });
    setBusy(false);
    if (!r.ok) return setMeldung({ ok: false, text: r.message });
    onFertig((r.data as { mitglied: { id: number } }).mitglied.id);
  }

  const feld = (key: keyof typeof werte, label: string, pflicht = false, typ = "text") => (
    <div className="grid gap-2">
      <Label htmlFor={`neu-${key}`}>{label}{pflicht && <span aria-hidden> *</span>}</Label>
      <Input id={`neu-${key}`} type={typ} required={pflicht} value={werte[key]} onChange={(e) => setWerte({ ...werte, [key]: e.target.value })} />
    </div>
  );

  return (
    <Card className="border-primary/40">
      <CardHeader><CardTitle>Neues Mitglied</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={anlegen} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {feld("vorname", "Vorname", true)}
            {feld("name", "Nachname", true)}
            {feld("dienstgrad", "Dienstgrad")}
            {feld("personalnummer", "Personalnummer")}
            {feld("email", "E-Mail", false, "email")}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={mitLogin} onChange={(e) => setMitLogin(e.target.checked)} />
            Gleich einen Login anlegen
          </label>
          {mitLogin && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="neu-benutzername">Benutzername</Label>
                <Input id="neu-benutzername" required maxLength={64} autoComplete="off" value={login.benutzername} onChange={(e) => setLogin({ ...login, benutzername: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="neu-rolle">App-Rolle</Label>
                <Select value={login.rolle} onValueChange={(v) => setLogin({ ...login, rolle: v })}>
                  <SelectTrigger id="neu-rolle" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{appRollen.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="neu-pin">PIN (mind. 6 Zeichen)</Label>
                <Input id="neu-pin" type="password" required minLength={6} autoComplete="new-password" value={login.pin} onChange={(e) => setLogin({ ...login, pin: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="neu-pin2">PIN wiederholen</Label>
                <Input id="neu-pin2" type="password" required minLength={6} autoComplete="new-password" value={login.pin2} onChange={(e) => setLogin({ ...login, pin2: e.target.value })} />
              </div>
            </div>
          )}
          {meldung && <p role="alert" className="text-sm text-destructive">{meldung.text}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy}>Anlegen</Button>
            <Button type="button" variant="ghost" onClick={onAbbrechen}>Abbrechen</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
