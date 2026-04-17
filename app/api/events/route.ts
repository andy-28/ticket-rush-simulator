// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, totalTickets, startAt } = body;

    // 基本驗證
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!Number.isInteger(totalTickets) || totalTickets <= 0) {
      return NextResponse.json(
        { error: "totalTickets must be a positive integer" },
        { status: 400 }
      );
    }
    if (totalTickets > 100_000) {
      return NextResponse.json(
        { error: "totalTickets too large (max 100000)" },
        { status: 400 }
      );
    }

    // 用 transaction 包起來:建 Event + 一次 createMany 建所有 Ticket
    // 這兩步必須一起成功,不能 Event 建好但 Ticket 沒建
    const event = await prisma.$transaction(async (tx) => {
      const ev = await tx.event.create({
        data: {
          name,
          totalTickets,
          remaining: totalTickets,
          startAt: startAt ? new Date(startAt) : new Date(),
        },
      });

      // 一次建 N 張票 - 用 createMany 而不是 for loop + create
      const ticketsData = Array.from({ length: totalTickets }, (_, i) => ({
        eventId: ev.id,
        seatNo: i + 1,
      }));

      await tx.ticket.createMany({ data: ticketsData });

      return ev;
    });
    // 同步庫存到 Redis
    await redis.set(`ticket:stock:${event.id}`, event.totalTickets.toString());
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("[POST /api/events] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(events);
}