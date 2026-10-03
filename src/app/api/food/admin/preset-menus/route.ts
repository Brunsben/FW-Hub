import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodPresetMenus } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { logFoodAdmin } from "@/lib/food-utils";

async function requireAdmin() {
  const session = await requireFoodSession();
  if (!session) return { error: "Nicht autorisiert", status: 401 as const };
  if (!session.isAdmin)
    return { error: "Nicht berechtigt", status: 403 as const };
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const presets = await db
    .select()
    .from(foodPresetMenus)
    .orderBy(asc(foodPresetMenus.sortOrder), asc(foodPresetMenus.name));
  return NextResponse.json({ preset_menus: presets });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { name, sort_order } = body;
  if (!name) {
    return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
  }

  const [preset] = await db
    .insert(foodPresetMenus)
    .values({ name: String(name), sortOrder: Number(sort_order) || 0 })
    .returning();

  await logFoodAdmin(auth.session.kameradName, "Voreinstellung erstellt", name);

  return NextResponse.json(
    { success: true, preset_menu: preset },
    { status: 201 },
  );
}

// PUT war im Original nicht vorhanden — hier als CRUD-Ergänzung: Name/Reihenfolge
// einer bestehenden Voreinstellung aktualisieren.
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const id = Number(body.id);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("name" in body) update.name = String(body.name);
  if ("sort_order" in body) update.sortOrder = Number(body.sort_order) || 0;
  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren" },
      { status: 400 },
    );
  }

  const [preset] = await db
    .update(foodPresetMenus)
    .set(update)
    .where(eq(foodPresetMenus.id, id))
    .returning();

  if (!preset) {
    return NextResponse.json(
      { error: "Voreinstellung nicht gefunden" },
      { status: 404 },
    );
  }

  await logFoodAdmin(
    auth.session.kameradName,
    "Voreinstellung aktualisiert",
    preset.name,
  );

  return NextResponse.json({ success: true, preset_menu: preset });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(foodPresetMenus)
    .where(eq(foodPresetMenus.id, id))
    .returning({ id: foodPresetMenus.id, name: foodPresetMenus.name });

  if (!deleted) {
    return NextResponse.json(
      { error: "Voreinstellung nicht gefunden" },
      { status: 404 },
    );
  }

  await logFoodAdmin(
    auth.session.kameradName,
    "Voreinstellung gelöscht",
    deleted.name,
  );

  return NextResponse.json({ success: true });
}
