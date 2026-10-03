"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

interface DayStat {
  date: string;
  description: string;
  menu1: number;
  menu2: number;
  guests_menu1: number;
  guests_menu2: number;
  total: number;
}

function fmt(d: string) {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("de-DE");
}

export function StatsView() {
  const [days, setDays] = useState("7");
  const [stats, setStats] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/food/stats?days=${d}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistik</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label>Zeitraum</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="30">30 Tage</SelectItem>
                <SelectItem value="90">90 Tage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" asChild>
            <a href="/api/food/stats/export">Export (CSV)</a>
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Menü</TableHead>
              <TableHead>Menü 1</TableHead>
              <TableHead>Menü 2</TableHead>
              <TableHead>Gäste</TableHead>
              <TableHead>Gesamt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Lädt…
                </TableCell>
              </TableRow>
            ) : stats.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Keine Daten im Zeitraum.
                </TableCell>
              </TableRow>
            ) : (
              stats.map((s) => (
                <TableRow key={s.date}>
                  <TableCell>{fmt(s.date)}</TableCell>
                  <TableCell>{s.description}</TableCell>
                  <TableCell>{s.menu1}</TableCell>
                  <TableCell>{s.menu2}</TableCell>
                  <TableCell>{s.guests_menu1 + s.guests_menu2}</TableCell>
                  <TableCell className="font-medium">{s.total}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
