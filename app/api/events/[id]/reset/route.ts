// app/api/events/[id]/reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // 用 transaction 一起重置 Event 和 Ticket
    const event = await prisma.$transaction(async (tx) => {
      const ev = await tx.event.findUnique({ where: { id } });
      if (!ev) throw new Error("not found");

      // 重置計數器
      const updated = await tx.event.update({
        where: { id },
        data: { remaining: ev.totalTickets },
      });

      // 重置所有 Ticket
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

    return NextResponse.json({ ok: true, remaining: event.remaining });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}