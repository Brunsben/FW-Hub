"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MitgliedLink } from "@/components/mitglieder/mitglied-link";
import { GROESSEN_FELDER, type Groessen } from "@/lib/psa-groessen";

export interface GroessenZeile extends Groessen {
  id: number;
  vorname: string;
  name: string;
  aktiv: boolean;
  /** Ziel des Namens-Links, siehe mitgliedLinkZiel() */
  link: string | null;
}

// Schreibgeschützte Größenübersicht auf /psa. Stammdaten und Größen pflegt man
// unter Mitglieder → Person → PSA. Die Übersicht bleibt, damit der Kleiderwart
// Größen schnell nachschlagen kann (z. B. beim Bestellen).
export function GroessenUebersicht({ zeilen }: { zeilen: GroessenZeile[] }) {
  const [suche, setSuche] = useState("");
  const [inaktive, setInaktive] = useState(false);

  const sichtbar = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return zeilen.filter((z) => {
      if (!inaktive && !z.aktiv) return false;
      if (!s) return true;
      return `${z.vorname} ${z.name}`.toLowerCase().includes(s) || `${z.name} ${z.vorname}`.toLowerCase().includes(s);
    });
  }, [zeilen, suche, inaktive]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Größen</CardTitle>
            <CardDescription>
              Übersicht, schreibgeschützt. Bearbeiten unter Mitglieder → Person → PSA.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/mitglieder">Zu den Mitgliedern</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="groessen-suche">Suche</Label>
            <Input
              id="groessen-suche"
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Name"
              className="w-64 max-w-full"
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={inaktive} onChange={(e) => setInaktive(e.target.checked)} />
            Inaktive anzeigen
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {GROESSEN_FELDER.map((f) => (
                <TableHead key={f.feld}>{f.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sichtbar.length === 0 ? (
              <TableRow>
                <TableCell colSpan={GROESSEN_FELDER.length + 1} className="py-10 text-center text-muted-foreground">
                  Keine Kameraden gefunden.
                </TableCell>
              </TableRow>
            ) : (
              sichtbar.map((z) => (
                <TableRow key={z.id}>
                  <TableCell>
                    <MitgliedLink ziel={z.link} className="block max-w-[12rem] truncate">
                      {z.name}, {z.vorname}
                    </MitgliedLink>
                    {!z.aktiv && <Badge variant="destructive" className="mt-1">inaktiv</Badge>}
                  </TableCell>
                  {GROESSEN_FELDER.map((f) => (
                    <TableCell key={f.feld}>{z[f.feld] ?? <span className="text-muted-foreground">–</span>}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
