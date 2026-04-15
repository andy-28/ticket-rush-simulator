// app/api/purchase/route.ts
import { NextRequest, NextResponse } from "next/server";
import { executePurchase } from "@/lib/services/purchaseService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, userId, qty = 1, strategy = "DB_ATOMIC" } = body;

    if (!eventId || !userId) {
      return NextResponse.json(
        { error: "eventId and userId are required" },
        { status: 400 }
      );
    }

    const result = await executePurchase(strategy, eventId, userId, qty);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/purchase] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}