// lib/services/purchaseService.ts
import { prisma } from "@/lib/db";

export type PurchaseResult = {
  result: "SUCCESS" | "FAILED";
  reason?: string;
  userId: string;
  qty: number;
  remaining: number | null;
  latencyMs: number;
};

/**
 * DB_ATOMIC 策略：單一原子 UPDATE
 * 把「讀 + 判斷 + 寫」塞進一個 SQL
 */
async function purchaseAtomic(
  eventId: string,
  userId: string,
  qty: number
): Promise<PurchaseResult> {
  const start = Date.now();

  const updated = await prisma.event.updateMany({
    where: {
      id: eventId,
      remaining: { gte: qty },
    },
    data: {
      remaining: { decrement: qty },
    },
  });

  if (updated.count === 0) {
    return {
      result: "FAILED",
      reason: "SOLD_OUT",
      userId,
      qty,
      remaining: null,
      latencyMs: Date.now() - start,
    };
  }

  return {
    result: "SUCCESS",
    userId,
    qty,
    remaining: null, // 不多查一次了, 省效能
    latencyMs: Date.now() - start,
  };
}

/**
 * NO_LOCK 策略：故意的「讀後寫」, 會超賣
 * 教學用, 用來展示 race condition
 */
async function purchaseNoLock(
  eventId: string,
  userId: string,
  qty: number
): Promise<PurchaseResult> {
  const start = Date.now();

  // Step 1: 讀
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event || event.remaining < qty) {
    return {
      result: "FAILED",
      reason: event ? "SOLD_OUT" : "EVENT_NOT_FOUND",
      userId,
      qty,
      remaining: event?.remaining ?? 0,
      latencyMs: Date.now() - start,
    };
  }

  // 放大 race condition 窗口
  await new Promise((r) => setTimeout(r, 5));

  // Step 2: 寫 (用讀到的舊值, 會被覆蓋)
  await prisma.event.update({
    where: { id: eventId },
    data: { remaining: event.remaining - qty },
  });

  return {
    result: "SUCCESS",
    userId,
    qty,
    remaining: event.remaining - qty,
    latencyMs: Date.now() - start,
  };
}

/**
 * 統一入口: 根據策略選擇不同實作
 */
export async function executePurchase(
  strategy: "NO_LOCK" | "DB_ATOMIC",
  eventId: string,
  userId: string,
  qty: number
): Promise<PurchaseResult> {
  switch (strategy) {
    case "NO_LOCK":
      return purchaseNoLock(eventId, userId, qty);
    case "DB_ATOMIC":
      return purchaseAtomic(eventId, userId, qty);
    default:
      return purchaseAtomic(eventId, userId, qty);
  }
}