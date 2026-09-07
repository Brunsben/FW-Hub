import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { funkDevices } from "@/lib/db/schema";
import { requireFunkSession } from "@/lib/funk-auth";

const DEVICE_TYPES = ["sepura", "unication", "oelmann", "other"] as const;
const DEVICE_STATUS = [
  "active",
  "inactive",
  "maintenance",
  "decommissioned",
] as const;

type DeviceType = (typeof DEVICE_TYPES)[number];
type DeviceStatus = (typeof DEVICE_STATUS)[number];

const isDeviceType = (v: unknown): v is DeviceType =>
  typeof v === "string" && DEVICE_TYPES.includes(v as DeviceType);
const isDeviceStatus = (v: unknown): v is DeviceStatus =>
  typeof v === "string" && DEVICE_STATUS.includes(v as DeviceStatus);

export async function GET(req: NextRequest) {
  const session = await requireFunkSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const typeRaw = params.get("deviceType");
  const statusRaw = params.get("status");

  const conditions = [];
  if (isDeviceType(typeRaw)) conditions.push(eq(funkDevices.deviceType, typeRaw));
  if (isDeviceStatus(statusRaw))
    conditions.push(eq(funkDevices.status, statusRaw));

  const devices = await db
    .select()
    .from(funkDevices)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(funkDevices.createdAt));

  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const session = await requireFunkSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.serialNumber || !isDeviceType(body.deviceType)) {
    return NextResponse.json(
      { error: "serialNumber und gültiger deviceType erforderlich" },
      { status: 400 },
    );
  }

  const [device] = await db
    .insert(funkDevices)
    .values({
      serialNumber: String(body.serialNumber),
      deviceType: body.deviceType,
      model: body.model ? String(body.model) : null,
      manufacturer: body.manufacturer ? String(body.manufacturer) : null,
      purchaseDate: body.purchaseDate ? String(body.purchaseDate) : null,
      status: isDeviceStatus(body.status) ? body.status : "active",
      location: body.location ? String(body.location) : null,
      notes: body.notes ? String(body.notes) : null,
    })
    .returning();

  return NextResponse.json({ device }, { status: 201 });
}
