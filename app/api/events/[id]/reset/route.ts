// app/api/events/[id]/reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const event = await prisma.$transaction(async (tx) => {
      const ev = await tx.event.findUnique({ where: { id } });
      if (!ev) throw new Error("not found");

      const updated = await tx.event.update({
        where: { id },
        data: { remaining: ev.totalTickets },
      });

      await tx.ticket.updateMany({
        where: { eventId: id },
        data: {
          status: "AVAILABLE",
          ownerUserId: null,
          ownerRunId: null,
          soldAt: null,
        },
      });

      return updated;
    });

    // 同步重置 Redis 庫存
    await redis.set(`ticket:stock:${id}`, event.totalTickets.toString());

    return NextResponse.json({ ok: true, remaining: event.remaining });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}