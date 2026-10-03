"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export interface PresetRow {
  id: number;
  name: string;
  sortOrder: number;
}

export function PresetManager({ presets }: { presets: PresetRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSort, setEditSort] = useState("0");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/food/admin/preset-menus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), sort_order: Number(sortOrder) }),
    });
    if (res.ok) {
      setName("");
      setSortOrder("0");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Anlegen fehlgeschlagen");
    }
  }

  async function saveEdit(id: number) {
    const res = await fetch("/api/food/admin/preset-menus", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: editName.trim(),
        sort_order: Number(editSort),
      }),
    });
    if (res.ok) {
      setEditId(null);
      router.refresh();
    }
  }

  async function remove(id: number) {
    if (!confirm("Voreinstellung wirklich löschen?")) return;
    const res = await fetch(`/api/food/admin/preset-menus?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Menü-Voreinstellungen</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="preset-name">Name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-64"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="preset-sort">Reihenfolge</Label>
            <Input
              id="preset-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-28"
            />
          </div>
          <Button type="submit" disabled={!name.trim()}>
            Hinzufügen
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Reihenfolge</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {presets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  Keine Voreinstellungen.
                </TableCell>
              </TableRow>
            ) : (
              presets.map((p) =>
                editId === p.id ? (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={editSort}
                        onChange={(e) => setEditSort(e.target.value)}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveEdit(p.id)}
                        >
                          Speichern
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditId(null)}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.sortOrder}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditId(p.id);
                            setEditName(p.name);
                            setEditSort(String(p.sortOrder));
                          }}
                        >
                          Bearbeiten
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => remove(p.id)}
                        >
                          Löschen
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
