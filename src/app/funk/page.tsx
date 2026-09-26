import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  funkDeviceAssignments,
  funkDevices,
  kameraden,
} from "@/lib/db/schema";
import { requireFunkSession } from "@/lib/funk-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEVICE_STATUS_LABELS,
  DEVICE_STATUS_VARIANTS,
  DEVICE_TYPE_LABELS,
  type DeviceStatus,
  type DeviceType,
} from "@/lib/funk-labels";
import { NewDeviceForm } from "@/components/funk/new-device-form";
import {
  AssignDeviceForm,
  type AssignableDevice,
  type KameradOption,
} from "@/components/funk/assign-device-form";

function StatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <Badge variant={DEVICE_STATUS_VARIANTS[status]}>
      {DEVICE_STATUS_LABELS[status]}
    </Badge>
  );
}

export default async function FunkPage() {
  const session = await requireFunkSession();
  if (!session) redirect("/login");

  // Admin/Gerätewart: alle Geräte inkl. aktueller Zuweisung + Formulare.
  if (session.isAdmin) {
    const rows = await db
      .select({
        id: funkDevices.id,
        serialNumber: funkDevices.serialNumber,
        deviceType: funkDevices.deviceType,
        status: funkDevices.status,
        ownerId: funkDeviceAssignments.ownerId,
        ownerName: kameraden.name,
        ownerVorname: kameraden.vorname,
      })
      .from(funkDevices)
      .leftJoin(
        funkDeviceAssignments,
        and(
          eq(funkDeviceAssignments.deviceId, funkDevices.id),
          isNull(funkDeviceAssignments.returnedAt),
        ),
      )
      .leftJoin(kameraden, eq(kameraden.id, funkDeviceAssignments.ownerId))
      .orderBy(asc(funkDevices.serialNumber));

    const kameradenRows = await db
      .select({
        id: kameraden.id,
        name: kameraden.name,
        vorname: kameraden.vorname,
      })
      .from(kameraden)
      .where(eq(kameraden.aktiv, true))
      .orderBy(asc(kameraden.name), asc(kameraden.vorname));

    const assignableDevices: AssignableDevice[] = rows
      .filter((r) => r.ownerId === null && r.status === "active")
      .map((r) => ({
        id: r.id,
        serialNumber: r.serialNumber,
        deviceType: r.deviceType as DeviceType,
      }));

    const kameradenOptions: KameradOption[] = kameradenRows.map((k) => ({
      id: k.id,
      label: `${k.vorname} ${k.name}`,
    }));

    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Funktechnik – Geräte</h1>
          <p className="text-sm text-muted-foreground">
            Angemeldet als {session.kameradName} ({session.funkRole})
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Geräteliste</CardTitle>
            <CardDescription>
              Alle Geräte mit aktueller Zuweisung.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seriennummer</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktuelle Zuweisung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground"
                    >
                      Noch keine Geräte erfasst.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.serialNumber}
                      </TableCell>
                      <TableCell>
                        {DEVICE_TYPE_LABELS[r.deviceType as DeviceType]}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status as DeviceStatus} />
                      </TableCell>
                      <TableCell>
                        {r.ownerId ? (
                          `${r.ownerVorname} ${r.ownerName}`
                        ) : (
                          <span className="text-muted-foreground">
                            Nicht zugewiesen
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Neues Gerät anlegen</CardTitle>
          </CardHeader>
          <CardContent>
            <NewDeviceForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gerät zuteilen</CardTitle>
            <CardDescription>
              Weist ein freies Gerät einem Kameraden zu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssignDeviceForm
              devices={assignableDevices}
              kameraden={kameradenOptions}
            />
          </CardContent>
        </Card>
      </main>
    );
  }

  // Einsatzleiter/Mitglied: nur Leseansicht der eigenen zugeteilten Geräte.
  const myRows = await db
    .select({
      id: funkDevices.id,
      serialNumber: funkDevices.serialNumber,
      deviceType: funkDevices.deviceType,
      status: funkDevices.status,
      assignmentDate: funkDeviceAssignments.assignmentDate,
    })
    .from(funkDeviceAssignments)
    .innerJoin(
      funkDevices,
      eq(funkDevices.id, funkDeviceAssignments.deviceId),
    )
    .where(
      and(
        eq(funkDeviceAssignments.ownerId, session.kameradId),
        isNull(funkDeviceAssignments.returnedAt),
      ),
    )
    .orderBy(asc(funkDevices.serialNumber));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Meine Funkgeräte</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als {session.kameradName} ({session.funkRole})
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mir zugeteilte Geräte</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seriennummer</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zugewiesen seit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    Dir ist derzeit kein Gerät zugeteilt.
                  </TableCell>
                </TableRow>
              ) : (
                myRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.serialNumber}
                    </TableCell>
                    <TableCell>
                      {DEVICE_TYPE_LABELS[r.deviceType as DeviceType]}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status as DeviceStatus} />
                    </TableCell>
                    <TableCell>
                      {new Date(r.assignmentDate).toLocaleDateString("de-DE")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
