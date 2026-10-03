import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { foodMobileTokens } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { logFoodAdmin } from "@/lib/food-utils";

// Erzeugt (oder ersetzt) den mobilen QR-Token eines Kameraden.
// kamerad_id ist unique → onConflictDoUpdate ersetzt einen bestehenden Token.
export async function POST(req: NextRequest) {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const kameradId = Number(body.kameradId);
  if (!kameradId || Number.isNaN(kameradId)) {
    return NextResponse.json({ error: "kameradId erforderlich" }, {
      status: 400,
    });
  }

  const token = randomBytes(24).toString("hex");

  try {
    const [row] = await db
      .insert(foodMobileTokens)
      .values({ kameradId, token })
      .onConflictDoUpdate({
        target: foodMobileTokens.kameradId,
        set: { token, createdAt: new Date() },
      })
      .returning({ token: foodMobileTokens.token });

    await logFoodAdmin(
      session.kameradName,
      "QR-Token erzeugt",
      `Kamerad ${kameradId}`,
    );

    return NextResponse.json({
      token: row.token,
      url: `/food/m/${row.token}`,
    });
  } catch {
    // FK-Verletzung: kein Kamerad mit dieser Id.
    return NextResponse.json(
      { error: "Kamerad nicht gefunden" },
      { status: 404 },
    );
  }
}
