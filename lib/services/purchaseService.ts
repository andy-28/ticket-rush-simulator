// lib/services/purchaseService.ts
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export type PurchaseResult = {
  result: "SUCCESS" | "FAILED";
  reason?: string;
  userId: string;
  qty: number;
  remaining: number | null;
  latencyMs: number;
};

// ─── DB_ATOMIC：單一原子 UPDATE ──────────────────────
async function purchaseAtomic(
  eventId: string,
  userId: string,
  qty: number
): Promise<PurchaseResult> {
  const start = Date.now();

  const updated = await prisma.event.updateMany({
    where: { id: eventId, remaining: { gte: qty } },
    data: { remaining: { decrement: qty } },
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
    remaining: null,
    latencyMs: Date.now() - start,
  };
}

// ─── NO_LOCK：故意的讀後寫（會超賣）────────────────
async function purchaseNoLock(
  eventId: string,
  userId: string,
  qty: number
): Promise<PurchaseResult> {
  const start = Date.now();

  const event = await prisma.event.findUnique({ where: { id: eventId } });

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

  await new Promise((r) => setTimeout(r, 5));

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

// ─── REDIS_ATOMIC：Redis Lua script 原子扣減 ────────
//
// 這是整個 Phase 3 的核心
//
// Lua script 在 Redis 內部執行，Redis 是單執行緒的，
// 所以整個 script 的執行是「不可被打斷的」— 天然原子。
//
// 這個 script 做的事：
// 1. 讀取目前庫存 (GET)
// 2. 檢查夠不夠 (tonumber 比較)
// 3. 扣減 (DECRBY)
// 4. 回傳剩餘數量
//
// 如果用分離的 GET + DECRBY，中間會被其他 command 穿插
// （就像 DB 的讀後寫問題一樣）
// Lua script 保證這四步在一個 "transaction" 裡完成

const REDIS_DEDUCT_SCRIPT = `
  local key = KEYS[1]
  local qty = tonumber(ARGV[1])
  local current = tonumber(redis.call('GET', key) or '0')
  if current < qty then
    return -1
  end
  local newVal = redis.call('DECRBY', key, qty)
  return newVal
`;

async function purchaseRedisAtomic(
  eventId: string,
  userId: string,
  qty: number
): Promise<PurchaseResult> {
  const start = Date.now();
  const redisKey = `ticket:stock:${eventId}`;

  try {
    // 用 eval 執行 Lua script
    // KEYS[1] = redisKey, ARGV[1] = qty
    const result = await redis.eval(
      REDIS_DEDUCT_SCRIPT,
      1,
      redisKey,
      qty.toString()
    );

    const remaining = Number(result);

    if (remaining < 0) {
      // Lua script 回傳 -1 代表庫存不足
      return {
        result: "FAILED",
        reason: "SOLD_OUT",
        userId,
        qty,
        remaining: null,
        latencyMs: Date.now() - start,
      };
    }

    // Redis 扣減成功！
    // 用原子 decrement 同步 DB，不能用覆蓋值（會有並發問題）
    await prisma.event.updateMany({
      where: { id: eventId, remaining: { gte: qty } },
      data: { remaining: { decrement: qty } },
    });
    
    return {
      result: "SUCCESS",
      userId,
      qty,
      remaining,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    console.error("[purchaseRedisAtomic] error:", error);
    return {
      result: "FAILED",
      reason: "REDIS_ERROR",
      userId,
      qty,
      remaining: null,
      latencyMs: Date.now() - start,
    };
  }
}

// ─── 統一入口 ────────────────────────────────────────
export async function executePurchase(
  strategy: "NO_LOCK" | "DB_ATOMIC" | "REDIS_ATOMIC",
  eventId: string,
  userId: string,
  qty: number
): Promise<PurchaseResult> {
  switch (strategy) {
    case "NO_LOCK":
      return purchaseNoLock(eventId, userId, qty);
    case "REDIS_ATOMIC":
      return purchaseRedisAtomic(eventId, userId, qty);
    case "DB_ATOMIC":
    default:
      return purchaseAtomic(eventId, userId, qty);
  }
}

// ─── Redis 庫存初始化 / 同步 ─────────────────────────
//
// 模擬開始前，要把 DB 的庫存同步到 Redis
// 真實系統會在「活動建立」或「開賣前」做這件事

export async function syncStockToRedis(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { remaining: true },
  });
  if (!event) throw new Error("Event not found");

  const redisKey = `ticket:stock:${eventId}`;
  await redis.set(redisKey, event.remaining.toString());
}

export async function getRedisStock(eventId: string): Promise<number> {
  const val = await redis.get(`ticket:stock:${eventId}`);
  return val ? parseInt(val, 10) : 0;
}