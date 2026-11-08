import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { funkDeviceAssignments, funkDevices } from "@/lib/db/schema";
import { withFunkScope } from "@/lib/db/scoped";
import {
  DEVICE_STATUS_LABELS,
  DEVICE_STATUS_VARIANTS,
  DEVICE_TYPE_LABELS,
  type DeviceStatus,
  type DeviceType,
} from "@/lib/funk-labels";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { kannFunkAbschnittSehen } from "@/lib/mitglieder/rechte";
import { datumKurz } from "@/lib/zeit";

// Funk-Abschnitt der Mitgliederseite: zugeteilte Geräte, nur lesend. Sehen
// dürfen Funk-Admin und Gerätewart. Zuteilen und Zurücknehmen bleibt in der
// Geräteverwaltung (/funk). Hinweis: fw_funk hat noch keine RLS, die Rolle
// prüft hier der Code (Folgepaket).
export const funkAbschnitt: MitgliedAbschnitt = {
  key: "funk",
  titel: "Funk",
  beschreibung: "Zugeteilte Funkgeräte (nur lesend)",
  reihenfolge: 120,
  profil: true,
  rechte: (user, id) => ({ sehen: kannFunkAbschnittSehen(user, id), bearbeiten: false }),
  async Komponente({ mitgliedId, user }) {
    const geraete = await withFunkScope(
      { kameradId: user.kamerad_id, funkRolle: user.funk_rolle ?? "" },
      (tx) =>
        tx
          .select({
            id: funkDevices.id,
            seriennummer: funkDevices.serialNumber,
            typ: funkDevices.deviceType,
            status: funkDevices.status,
            seit: funkDeviceAssignments.assignmentDate,
            rueckgabe: funkDeviceAssignments.expectedReturnDate,
          })
          .from(funkDeviceAssignments)
          .innerJoin(funkDevices, eq(funkDevices.id, funkDeviceAssignments.deviceId))
          .where(
            and(
              eq(funkDeviceAssignments.ownerId, mitgliedId),
              isNull(funkDeviceAssignments.returnedAt),
            ),
          )
          .orderBy(asc(funkDevices.serialNumber)),
    );

    return (
      <div className="grid gap-3">
        <Table className="max-md:min-w-0">
          <TableHeader>
            <TableRow>
              <TableHead>Gerät</TableHead>
              <TableHead className="hidden md:table-cell">Typ</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead>Seit</TableHead>
              <TableHead className="hidden md:table-cell">Rückgabe bis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {geraete.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Keine Funkgeräte zugeteilt.
                </TableCell>
              </TableRow>
            ) : (
              geraete.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="break-words whitespace-normal">
                    <span className="font-medium">{g.seriennummer}</span>
                    <span className="block text-xs text-muted-foreground md:hidden">
                      {DEVICE_TYPE_LABELS[g.typ as DeviceType] ?? g.typ}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {DEVICE_TYPE_LABELS[g.typ as DeviceType] ?? g.typ}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={DEVICE_STATUS_VARIANTS[g.status as DeviceStatus]}>
                      {DEVICE_STATUS_LABELS[g.status as DeviceStatus] ?? g.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{datumKurz(g.seit)}</TableCell>
                  <TableCell className="hidden md:table-cell">{datumKurz(g.rueckgabe)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">
          Zuteilen und Zurücknehmen in der{" "}
          <Link href="/funk" className="underline underline-offset-4 hover:text-foreground">
            Geräteverwaltung
          </Link>
          .
        </p>
      </div>
    );
  },
};
