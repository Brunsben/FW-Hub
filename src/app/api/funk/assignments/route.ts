import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  funkAuditLog,
  funkDeviceAssignments,
  funkDevices,
} from "@/lib/db/schema";
import { requireFunkSession } from "@/lib/funk-auth";

export async function GET(req: NextRequest) {
  const session = await requireFunkSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const ownerParam = params.get("ownerId");
  const onlyOpen = params.get("open") === "true";
  const requestedOwnerId = ownerParam ? Number(ownerParam) : session.kameradId;

  // Nicht-Admins dürfen nur ihre eigenen Zuweisungen sehen.
  if (!session.isAdmin && requestedOwnerId !== session.kameradId) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const conditions = [eq(funkDeviceAssignments.ownerId, requestedOwnerId)];
  if (onlyOpen) conditions.push(isNull(funkDeviceAssignments.returnedAt));

  const assignments = await db.query.funkDeviceAssignments.findMany({
    where: and(...conditions),
    orderBy: [desc(funkDeviceAssignments.assignmentDate)],
    with: { device: true },
  });

  return NextResponse.json({ assignments });
}

export async function POST(req: NextRequest) {
  const session = await requireFunkSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const deviceId = body.deviceId ? String(body.deviceId) : null;
  const ownerId = body.ownerId != null ? Number(body.ownerId) : null;

  if (!deviceId || !ownerId || Number.isNaN(ownerId)) {
    return NextResponse.json(
      { error: "deviceId und ownerId sind erforderlich" },
      { status: 400 },
    );
  }

  const device = await db.query.funkDevices.findFirst({
    where: eq(funkDevices.id, deviceId),
  });
  if (!device) {
    return NextResponse.json({ error: "Gerät nicht gefunden" }, { status: 404 });
  }

  const openAssignment = await db.query.funkDeviceAssignments.findFirst({
    where: and(
      eq(funkDeviceAssignments.deviceId, deviceId),
      isNull(funkDeviceAssignments.returnedAt),
    ),
  });
  if (openAssignment) {
    return NextResponse.json(
      { error: "Gerät ist bereits zugewiesen" },
      { status: 409 },
    );
  }

  const [assignment] = await db
    .insert(funkDeviceAssignments)
    .values({
      deviceId,
      ownerId,
      assignedById: session.kameradId,
      expectedReturnDate: body.expectedReturnDate
        ? String(body.expectedReturnDate)
        : null,
      notes: body.notes ? String(body.notes) : null,
      status: "assigned",
    })
    .returning();

  await db.insert(funkAuditLog).values({
    deviceId,
    ownerId,
    issuedById: session.kameradId,
    reason: body.reason ? String(body.reason) : "Ausgabe",
    status: "issued",
    notes: body.notes ? String(body.notes) : null,
  });

  return NextResponse.json({ assignment }, { status: 201 });
}

// Rückgabe eines Geräts: Admin/Gerätewart oder der Besitzer selbst.
export async function PATCH(req: NextRequest) {
  const session = await requireFunkSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await req.json();
  const assignmentId = body.assignmentId ? String(body.assignmentId) : null;
  if (!assignmentId) {
    return NextResponse.json(
      { error: "assignmentId erforderlich" },
      { status: 400 },
    );
  }

  const assignment = await db.query.funkDeviceAssignments.findFirst({
    where: eq(funkDeviceAssignments.id, assignmentId),
  });
  if (!assignment) {
    return NextResponse.json(
      { error: "Zuweisung nicht gefunden" },
      { status: 404 },
    );
  }
  if (assignment.returnedAt) {
    return NextResponse.json(
      { error: "Zuweisung ist bereits zurückgegeben" },
      { status: 409 },
    );
  }
  if (!session.isAdmin && assignment.ownerId !== session.kameradId) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const now = new Date();
  const [updated] = await db
    .update(funkDeviceAssignments)
    .set({
      returnedAt: now,
      returnedById: session.kameradId,
      status: "returned",
      updatedAt: now,
    })
    .where(eq(funkDeviceAssignments.id, assignmentId))
    .returning();

  await db.insert(funkAuditLog).values({
    deviceId: assignment.deviceId,
    ownerId: assignment.ownerId,
    issuedById: assignment.assignedById,
    returnedAt: now,
    returnedById: session.kameradId,
    reason: body.reason ? String(body.reason) : "Rückgabe",
    status: "returned",
  });

  return NextResponse.json({ assignment: updated });
}
