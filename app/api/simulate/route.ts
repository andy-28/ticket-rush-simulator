// app/api/simulate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { executePurchase } from "@/lib/services/purchaseService";
import {
  enqueue,
  setRateLimit,
  resetQueue,
  getQueueStatus,
} from "@/lib/services/queueService";
import { getIO } from "@/lib/socket";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      eventId,
      total = 500,
      concurrency = 100,
      qty = 1,
      strategy = "DB_ATOMIC",
      enableQueue = false,
      rateLimitPerSec = 100,
    } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 }
      );
    }
    if (total > 10000 || concurrency > 1000) {
      return NextResponse.json(
        { error: "total max 10000, concurrency max 1000" },
        { status: 400 }
      );
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json(
        { error: "event not found" },
        { status: 404 }
      );
    }

    const io = getIO();
    const results = { SUCCESS: 0, FAILED: 0 };
    const start = Date.now();
    let completed = 0;
    let i = 0;
    let totalWaitMs = 0;

    // 如果啟用 queue, 先重置並設定 rate limit
    if (enableQueue) {
      resetQueue();
      setRateLimit(rateLimitPerSec);
    }

    // 推播進度
    async function emitProgress() {
      if (!io) return;
      const current = await prisma.event.findUnique({
        where: { id: eventId },
        select: { remaining: true },
      });
      const queueStatus = enableQueue ? getQueueStatus() : null;
      io.emit("sim:progress", {
        eventId,
        completed,
        total,
        results: { ...results },
        remaining: current?.remaining ?? 0,
        elapsedMs: Date.now() - start,
        timestamp: Date.now(),
        queueStatus,
      });
    }

    async function worker() {
      while (i < total) {
        const myIdx = i++;

        if (enableQueue) {
          // Queue 模式: 進 queue 排隊, 等到被處理才回來
          const r = await enqueue(eventId, `user-${myIdx}`, qty, strategy);
          results[r.result as "SUCCESS" | "FAILED"]++;
          totalWaitMs += r.waitMs;
        } else {
          // 直接模式: 直接打 DB
          const r = await executePurchase(
            strategy,
            eventId,
            `user-${myIdx}`,
            qty
          );
          results[r.result as "SUCCESS" | "FAILED"]++;
        }

        completed++;

        if (completed % 10 === 0 || completed === total) {
          await emitProgress();
        }
      }
    }

    io?.emit("sim:start", {
      eventId,
      total,
      concurrency,
      strategy,
      totalTickets: event.totalTickets,
      enableQueue,
      rateLimitPerSec: enableQueue ? rateLimitPerSec : null,
    });

    await Promise.all(Array.from({ length: concurrency }, worker));

    const elapsed = Date.now() - start;
    const finalEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });
    const sold = finalEvent
      ? finalEvent.totalTickets - finalEvent.remaining
      : 0;
    const oversold = Math.max(0, results.SUCCESS - sold);

    const finalResult = {
      ok: true,
      elapsedMs: elapsed,
      results,
      dbState: {
        totalTickets: finalEvent?.totalTickets ?? 0,
        remaining: finalEvent?.remaining ?? 0,
        sold,
      },
      oversold,
      strategy,
      enableQueue,
      rateLimitPerSec: enableQueue ? rateLimitPerSec : null,
      avgWaitMs: enableQueue
        ? Math.round(totalWaitMs / results.SUCCESS || 0)
        : 0,
    };

    io?.emit("sim:end", finalResult);
    return NextResponse.json(finalResult);
  } catch (error) {
    console.error("[POST /api/simulate] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}