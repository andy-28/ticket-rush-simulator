// lib/services/queueService.ts
import { executePurchase, PurchaseResult } from "./purchaseService";
import { getIO } from "../socket";

// ─── Types ───────────────────────────────────────────
type QueueItem = {
  id: string;
  eventId: string;
  userId: string;
  qty: number;
  strategy: "DB_ATOMIC" | "NO_LOCK";
  position: number;
  enqueuedAt: number;
  resolve: (result: QueuedPurchaseResult) => void;
};

export type QueuedPurchaseResult = PurchaseResult & {
  queuePosition: number;
  waitMs: number;
};

// ─── Queue State ─────────────────────────────────────
// 整個 queue 的狀態都在記憶體裡
// 這是刻意的選擇: 模擬器不需要持久化 queue
// 真實系統會用 Redis List 或 BullMQ

let queue: QueueItem[] = [];
let isProcessing = false;
let positionCounter = 0;
let rateLimit = 100; // 每秒處理幾個
let totalEnqueued = 0;
let totalProcessed = 0;

// ─── 核心: 令牌桶式的 rate-limited processor ────────
async function processQueue() {
  if (isProcessing) return; // 防止多個 processor 同時跑
  isProcessing = true;

  const io = getIO();

  while (queue.length > 0) {
    // 每一批: 從 queue 前面取 rateLimit 個
    const batchSize = Math.min(rateLimit, queue.length);
    const batch = queue.splice(0, batchSize);

    // 推播: 通知前端 queue 狀態變化
    io?.emit("queue:status", {
      queueLength: queue.length,
      processing: batch.length,
      totalEnqueued,
      totalProcessed,
    });

    // 並發處理這一批(batch 內的請求是「同時」打 DB 的)
    // 但因為 batch size 被 rateLimit 控制了, DB 不會被灌爆
    const promises = batch.map(async (item) => {
      const result = await executePurchase(
        item.strategy,
        item.eventId,
        item.userId,
        item.qty
      );

      totalProcessed++;

      const queuedResult: QueuedPurchaseResult = {
        ...result,
        queuePosition: item.position,
        waitMs: Date.now() - item.enqueuedAt,
      };

      // 把結果 resolve 回去給等待的 caller
      item.resolve(queuedResult);

      return queuedResult;
    });

    await Promise.all(promises);

    // 推播: 每批處理完的狀態
    io?.emit("queue:status", {
      queueLength: queue.length,
      processing: 0,
      totalEnqueued,
      totalProcessed,
    });

    // 等 1 秒再處理下一批
    // 這就是「每秒處理 rateLimit 個」的控制
    if (queue.length > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  isProcessing = false;
}

// ─── 公開 API ────────────────────────────────────────

/**
 * 設定每秒處理量
 */
export function setRateLimit(limit: number) {
  rateLimit = Math.max(1, Math.min(limit, 10000));
}

/**
 * 取得目前 queue 狀態
 */
export function getQueueStatus() {
  return {
    queueLength: queue.length,
    rateLimit,
    totalEnqueued,
    totalProcessed,
    isProcessing,
  };
}

/**
 * 重置 queue(新實驗前呼叫)
 */
export function resetQueue() {
  queue = [];
  isProcessing = false;
  positionCounter = 0;
  totalEnqueued = 0;
  totalProcessed = 0;
}

/**
 * 把一個購票請求放進 queue
 * 回傳一個 Promise, 等到這個請求被「處理」時才 resolve
 */
export function enqueue(
  eventId: string,
  userId: string,
  qty: number,
  strategy: "DB_ATOMIC" | "NO_LOCK"
): Promise<QueuedPurchaseResult> {
  return new Promise((resolve) => {
    positionCounter++;
    totalEnqueued++;

    const item: QueueItem = {
      id: `${userId}-${Date.now()}`,
      eventId,
      userId,
      qty,
      strategy,
      position: positionCounter,
      enqueuedAt: Date.now(),
      resolve,
    };

    queue.push(item);

    // 推播: 通知前端這個 user 的排隊位置
    const io = getIO();
    io?.emit("queue:position", {
      userId,
      position: positionCounter,
      queueLength: queue.length,
    });

    // 啟動 processor(如果還沒在跑)
    processQueue();
  });
}