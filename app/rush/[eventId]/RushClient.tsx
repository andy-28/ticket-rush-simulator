// app/rush/[eventId]/RushClient.tsx
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Link from "next/link";

type Phase = "COUNTDOWN" | "WAITING" | "PURCHASING" | "RESULT";

type Props = {
  eventId: string;
  eventName: string;
  totalTickets: number;
  remaining: number;
  startAt: string;
};

export default function RushClient({
  eventId,
  eventName,
  totalTickets,
  remaining: initialRemaining,
}: Props) {
  // ─── State Machine ──────────────────────────
  const [phase, setPhase] = useState<Phase>("COUNTDOWN");
  const [countdown, setCountdown] = useState(5);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [qty, setQty] = useState(1);
  const [purchasing, setPurchasing] = useState(false);

  // Queue / Waiting
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState(0);

  // Result
  const [resultStatus, setResultStatus] = useState<"SUCCESS" | "FAILED" | null>(null);
  const [resultMsg, setResultMsg] = useState("");

  // Strategy (controlled from URL or default)
  const [strategy] = useState<"DB_ATOMIC" | "REDIS_ATOMIC">("REDIS_ATOMIC");

  // Socket.IO
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const userIdRef = useRef(`user-${Math.random().toString(36).slice(2, 10)}`);

  // ─── Socket.IO Setup ────────────────────────
  useEffect(() => {
    const socket = io({ transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // 監聽庫存變化（其他人搶票時即時更新）
    socket.on("stock:update", (data: { eventId: string; remaining: number }) => {
      if (data.eventId === eventId) {
        setRemaining(data.remaining);
      }
    });

    // 監聯排隊位置更新
    socket.on(
      "queue:position",
      (data: { userId: string; position: number; queueLength: number }) => {
        if (data.userId === userIdRef.current) {
          setQueuePosition(data.position);
        }
        setQueueTotal(data.queueLength);
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [eventId]);

  // ─── Countdown Timer ────────────────────────
  useEffect(() => {
    if (phase !== "COUNTDOWN") return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase("WAITING");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // ─── Auto-transition from WAITING to PURCHASING ──
  useEffect(() => {
    if (phase !== "WAITING") return;

    // 模擬排隊等待 2-4 秒後放行
    const waitTime = 2000 + Math.random() * 2000;
    const timer = setTimeout(() => {
      setPhase("PURCHASING");
    }, waitTime);

    // 模擬排隊位置遞減
    setQueuePosition(Math.floor(Math.random() * 500) + 100);
    const posTimer = setInterval(() => {
      setQueuePosition((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - Math.floor(Math.random() * 30 + 10);
      });
    }, 500);

    return () => {
      clearTimeout(timer);
      clearInterval(posTimer);
    };
  }, [phase]);

  // ─── Purchase Handler ───────────────────────
  const handlePurchase = useCallback(async () => {
    setPurchasing(true);

    try {
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId,
          userId: userIdRef.current,
          qty,
          strategy,
        }),
      });

      const data = await res.json();

      if (data.result === "SUCCESS") {
        setResultStatus("SUCCESS");
        setResultMsg(`恭喜！您成功搶到 ${qty} 張票！`);
      } else {
        setResultStatus("FAILED");
        setResultMsg(
          data.reason === "SOLD_OUT"
            ? "很抱歉，票已售完"
            : "搶票失敗，請稍後再試"
        );
      }

      setPhase("RESULT");
    } catch {
      setResultStatus("FAILED");
      setResultMsg("網路錯誤，請稍後再試");
      setPhase("RESULT");
    } finally {
      setPurchasing(false);
    }
  }, [eventId, qty, strategy]);

  // ─── Render ─────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 mb-4">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            {connected ? "已連線" : "連線中..."}
          </div>
          <h1 className="text-2xl font-bold">{eventName}</h1>
          <p className="text-slate-400 mt-1">
            {totalTickets} 張票 · 剩餘{" "}
            <span
              className={
                remaining > 0 ? "text-emerald-400" : "text-red-400"
              }
            >
              {remaining}
            </span>{" "}
            張
          </p>
        </div>

        {/* ─── Phase: COUNTDOWN ──────────────── */}
        {phase === "COUNTDOWN" && (
          <div className="text-center">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10">
              <p className="text-slate-400 text-sm mb-4">即將開搶</p>
              <div className="text-7xl font-bold tabular-nums text-blue-400 mb-4">
                {countdown}
              </div>
              <p className="text-slate-500 text-sm">請勿離開此頁面</p>
            </div>
          </div>
        )}

        {/* ─── Phase: WAITING ────────────────── */}
        {phase === "WAITING" && (
          <div className="text-center">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10">
              <div className="mb-6">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
              <p className="text-lg font-semibold mb-2">排隊中...</p>
              {queuePosition !== null && queuePosition > 0 && (
                <p className="text-slate-400">
                  前方還有{" "}
                  <span className="text-white font-bold text-xl">
                    {queuePosition}
                  </span>{" "}
                  人
                </p>
              )}
              <div className="mt-6 w-full bg-slate-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(
                      5,
                      queuePosition !== null
                        ? 100 - (queuePosition / (queueTotal || 500)) * 100
                        : 10
                    )}%`,
                  }}
                />
              </div>
              <p className="text-slate-600 text-xs mt-4">
                請勿重新整理，您的位置將會保留
              </p>
            </div>
          </div>
        )}

        {/* ─── Phase: PURCHASING ─────────────── */}
        {phase === "PURCHASING" && (
          <div className="text-center">
            <div className="bg-slate-900 border border-emerald-800 rounded-2xl p-10">
              <div className="bg-emerald-900/30 text-emerald-400 text-sm px-4 py-2 rounded-lg inline-block mb-6">
                輪到您了！
              </div>

              <p className="text-lg font-semibold mb-6">選擇購買張數</p>

              <div className="flex justify-center gap-3 mb-8">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setQty(n)}
                    className={`w-14 h-14 rounded-xl text-lg font-bold transition-all ${
                      qty === n
                        ? "bg-blue-600 text-white scale-110"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <button
                onClick={handlePurchase}
                disabled={purchasing || remaining === 0}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-lg font-bold py-4 rounded-xl transition-colors"
              >
                {purchasing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    搶票中...
                  </span>
                ) : remaining === 0 ? (
                  "已售完"
                ) : (
                  `立即搶票 · ${qty} 張`
                )}
              </button>

              <p className="text-slate-600 text-xs mt-4">
                使用 {strategy === "REDIS_ATOMIC" ? "Redis" : "DB"} 原子扣減
              </p>
            </div>
          </div>
        )}

        {/* ─── Phase: RESULT ─────────────────── */}
        {phase === "RESULT" && (
          <div className="text-center">
            <div
              className={`rounded-2xl p-10 border ${
                resultStatus === "SUCCESS"
                  ? "bg-emerald-950 border-emerald-800"
                  : "bg-red-950 border-red-800"
              }`}
            >
              <div className="text-5xl mb-4">
                {resultStatus === "SUCCESS" ? "🎉" : "😢"}
              </div>
              <p className="text-xl font-bold mb-2">
                {resultStatus === "SUCCESS" ? "搶票成功！" : "搶票失敗"}
              </p>
              <p className="text-slate-400">{resultMsg}</p>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => {
                    setPhase("COUNTDOWN");
                    setCountdown(3);
                    setResultStatus(null);
                    setResultMsg("");
                    setQueuePosition(null);
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl transition-colors"
                >
                  再搶一次
                </button>
                <Link
                  href="/rush"
                  className="block w-full bg-slate-900 hover:bg-slate-800 text-slate-400 py-3 rounded-xl transition-colors"
                >
                  ← 回到活動列表
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-xs text-slate-600 hover:text-slate-400"
          >
            管理控制台
          </Link>
        </div>
      </div>
    </main>
  );
}