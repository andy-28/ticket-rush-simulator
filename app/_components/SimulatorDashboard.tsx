// app/_components/SimulatorDashboard.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ───────────────────────────────────────────
type Event = {
  id: string;
  name: string;
  totalTickets: number;
  remaining: number;
};

type SimProgress = {
  completed: number;
  total: number;
  results: { SUCCESS: number; FAILED: number };
  remaining: number;
  elapsedMs: number;
  timestamp: number;
  queueStatus?: {
    queueLength: number;
    totalEnqueued: number;
    totalProcessed: number;
  } | null;
};

type SimResult = {
  ok: boolean;
  elapsedMs: number;
  results: { SUCCESS: number; FAILED: number };
  dbState: { totalTickets: number; remaining: number; sold: number };
  oversold: number;
  strategy: string;
  enableQueue?: boolean;
  rateLimitPerSec?: number | null;
  avgWaitMs?: number;
};

type ChartPoint = {
  time: number;
  remaining: number;
  success: number;
  failed: number;
  queueLen?: number;
};

type HistoryEntry = {
  strategy: string;
  success: number;
  failed: number;
  oversold: number;
  elapsedMs: number;
  totalTickets: number;
  enableQueue: boolean;
  rateLimitPerSec: number | null;
  avgWaitMs: number;
};

const inputClass =
  "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

// ─── Main Component ──────────────────────────────────
export default function SimulatorDashboard() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("測試活動");
  const [totalTickets, setTotalTickets] = useState(100);

  const [simulating, setSimulating] = useState(false);
  const [total, setTotal] = useState(500);
  const [concurrency, setConcurrency] = useState(100);
  const [strategy, setStrategy] = useState<"DB_ATOMIC" | "NO_LOCK" | "REDIS_ATOMIC">("DB_ATOMIC");
  const [enableQueue, setEnableQueue] = useState(false);
  const [rateLimitPerSec, setRateLimitPerSec] = useState(50);
  const [progress, setProgress] = useState<SimProgress | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);

  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const startTimeRef = useRef<number>(0);

  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(data);
  }, []);

  useEffect(() => {
    const socket = io({ transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("sim:start", () => {
      startTimeRef.current = Date.now();
      setChartData([]);
    });

    socket.on("sim:progress", (data: SimProgress) => {
      setProgress(data);
      setChartData((prev) => [
        ...prev,
        {
          time: Math.round((Date.now() - startTimeRef.current) / 100) / 10,
          remaining: data.remaining,
          success: data.results.SUCCESS,
          failed: data.results.FAILED,
          queueLen: data.queueStatus?.queueLength ?? 0,
        },
      ]);
    });

    socket.on("sim:end", (data: SimResult) => {
      setResult(data);
      setSimulating(false);
      setHistory((prev) => [
        ...prev,
        {
          strategy: data.strategy,
          success: data.results.SUCCESS,
          failed: data.results.FAILED,
          oversold: data.oversold,
          elapsedMs: data.elapsedMs,
          totalTickets: data.dbState.totalTickets,
          enableQueue: data.enableQueue ?? false,
          rateLimitPerSec: data.rateLimitPerSec ?? null,
          avgWaitMs: data.avgWaitMs ?? 0,
        },
      ]);
      loadEvents();
    });

    return () => {
      socket.disconnect();
    };
  }, [loadEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, totalTickets, startAt: new Date().toISOString() }),
      });
      const ev = await res.json();
      await loadEvents();
      setSelectedId(ev.id);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定刪除?")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await loadEvents();
  }

  async function handleReset(id: string) {
    await fetch(`/api/events/${id}/reset`, { method: "POST" });
    await loadEvents();
  }

  async function handleSimulate() {
    if (!selectedId) return;
    setSimulating(true);
    setResult(null);
    setProgress(null);
    setChartData([]);

    fetch("/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: selectedId,
        total,
        concurrency,
        strategy,
        enableQueue,
        rateLimitPerSec: enableQueue ? rateLimitPerSec : undefined,
      }),
    }).catch((error) => {
      console.error("simulate failed:", error);
      setSimulating(false);
    });
  }

  const selectedEvent = events.find((e) => e.id === selectedId);

  return (
    <div className="space-y-6">
      {/* 狀態列 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {connected ? "WebSocket 已連線" : "WebSocket 未連線"}
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setHistory([])}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            清除歷史
          </button>
        )}
      </div>

      {/* ① 建立活動 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">① 建立活動</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="w-32">
            <label className="block text-sm text-slate-600 mb-1">票數</label>
            <input
              type="number"
              value={totalTickets}
              onChange={(e) => setTotalTickets(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg font-medium transition-colors"
          >
            {creating ? "建立中..." : "建立"}
          </button>
        </div>
      </section>

      {/* ② 選擇活動 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-semibold text-slate-900">② 選擇活動</h2>
          <button onClick={loadEvents} className="text-sm text-blue-600 hover:underline">
            ↻ 重新載入
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-slate-500 text-sm">尚無活動, 先建立一個</p>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <label
                key={ev.id}
                className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedId === ev.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={selectedId === ev.id}
                    onChange={() => setSelectedId(ev.id)}
                    className="accent-blue-600"
                  />
                  <div>
                    <div className="font-medium text-slate-900">{ev.name}</div>
                    <div className="text-sm text-slate-500">
                      剩 {ev.remaining} / {ev.totalTickets}
                      {ev.remaining === 0 && (
                        <span className="ml-2 text-red-500 text-xs">已售完</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {ev.remaining < ev.totalTickets && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleReset(ev.id);
                      }}
                      className="text-blue-500 hover:text-blue-700 text-sm"
                    >
                      ↻ 重置
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(ev.id);
                    }}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    🗑
                  </button>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* ③ 執行攻擊 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">③ 執行攻擊</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">總請求數</label>
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
              className={inputClass}
              disabled={simulating}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">並發數</label>
            <input
              type="number"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className={inputClass}
              disabled={simulating}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">策略</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as "DB_ATOMIC" | "NO_LOCK" | "REDIS_ATOMIC")}
              className={inputClass}
              disabled={simulating}
            >
              <option value="DB_ATOMIC">✅ DB 原子扣減（安全）</option>
              <option value="NO_LOCK">🔥 無鎖（會超賣）</option>
              <option value="REDIS_ATOMIC">⚡ Redis 原子扣減（最快）</option>
            </select>
          </div>
        </div>

        {/* Queue 控制 */}
        <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enableQueue}
              onChange={(e) => setEnableQueue(e.target.checked)}
              disabled={simulating}
              className="accent-purple-600 w-4 h-4"
            />
            <span className="text-sm font-medium text-slate-700">
              啟用排隊系統 (Queue)
            </span>
          </label>
          {enableQueue && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">每秒處理:</label>
              <input
                type="number"
                value={rateLimitPerSec}
                onChange={(e) => setRateLimitPerSec(Number(e.target.value))}
                className="w-20 border border-slate-300 rounded px-2 py-1 bg-white text-slate-900 text-sm"
                disabled={simulating}
                min={1}
                max={1000}
              />
              <span className="text-sm text-slate-500">req/s</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {selectedEvent && (
            <div className="text-sm text-slate-600">
              對象: <strong>{selectedEvent.name}</strong> (剩{" "}
              {selectedEvent.remaining}/{selectedEvent.totalTickets})
              {enableQueue && (
                <span className="ml-2 text-purple-600 text-xs font-medium">
                  Queue ON · {rateLimitPerSec}/s
                </span>
              )}
            </div>
          )}
          <button
            onClick={handleSimulate}
            disabled={simulating || !selectedId}
            className="bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-lg font-medium ml-auto transition-colors"
          >
            {simulating ? "攻擊中..." : "🚀 開始攻擊"}
          </button>
        </div>

        {/* 進度條 */}
        {simulating && progress && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex justify-between text-sm text-amber-800 mb-2">
              <span>進度: {progress.completed} / {progress.total}</span>
              <span>{progress.elapsedMs}ms</span>
            </div>
            <div className="w-full bg-amber-200 rounded-full h-2.5">
              <div
                className="bg-amber-500 h-2.5 rounded-full transition-all duration-100"
                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-emerald-700">✅ {progress.results.SUCCESS}</span>
              <span className="text-slate-600">❌ {progress.results.FAILED}</span>
              <span className="text-blue-600">📦 剩餘 {progress.remaining}</span>
              {progress.queueStatus && (
                <span className="text-purple-600">
                  🚶 排隊中 {progress.queueStatus.queueLength}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 最終結果 */}
        {result && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">結果</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  result.strategy === "NO_LOCK"
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {result.strategy === "NO_LOCK" ? "🔥 無鎖" : "✅ 原子扣減"}
              </span>
              {result.enableQueue && (
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                  🚶 Queue {result.rateLimitPerSec}/s
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="✅ 成功" value={result.results.SUCCESS} color="green" />
              <Stat label="❌ 失敗" value={result.results.FAILED} color="slate" />
              <Stat label="📦 剩餘" value={result.dbState.remaining} color="blue" />
              <Stat
                label="🔥 超賣"
                value={result.oversold}
                color={result.oversold > 0 ? "red" : "green"}
              />
              <Stat label="⏱ 耗時" value={`${result.elapsedMs}ms`} color="slate" />
            </div>
            {result.enableQueue && result.avgWaitMs !== undefined && (
              <div className="mt-3 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg p-3">
                🚶 Queue 模式 · 平均等待時間: {result.avgWaitMs}ms · 每秒處理: {result.rateLimitPerSec} req/s
              </div>
            )}
            {result.oversold > 0 && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                ⚠ 偵測到超賣! API 告訴 {result.results.SUCCESS} 人搶到, 但 DB 只扣了{" "}
                {result.dbState.sold} 張.
              </div>
            )}
            {result.oversold === 0 && result.results.SUCCESS > 0 && (
              <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-sm">
                ✅ 沒有超賣. 庫存扣減正確.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ④ 即時圖表 */}
      {chartData.length > 1 && (
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">④ 即時圖表</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-slate-600 mb-2">
                剩餘票數（隨時間）
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tickFormatter={(v) => `${v}s`} fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip formatter={(value: number) => [value, "剩餘"]} labelFormatter={(l) => `${l}s`} />
                  <Area type="stepAfter" dataKey="remaining" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-600 mb-2">
                成功 / 失敗（累積）
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tickFormatter={(v) => `${v}s`} fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name === "success" ? "成功" : "失敗"]}
                    labelFormatter={(l) => `${l}s`}
                  />
                  <Area type="monotone" dataKey="success" stackId="1" stroke="#10b981" fill="#d1fae5" strokeWidth={2} isAnimationActive={false} />
                  <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#fee2e2" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Queue 長度圖表 */}
            {chartData.some((d) => (d.queueLen ?? 0) > 0) && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-slate-600 mb-2">
                  排隊人數（隨時間）
                </h3>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tickFormatter={(v) => `${v}s`} fontSize={12} stroke="#94a3b8" />
                    <YAxis fontSize={12} stroke="#94a3b8" />
                    <Tooltip formatter={(value: number) => [value, "排隊中"]} labelFormatter={(l) => `${l}s`} />
                    <Area type="monotone" dataKey="queueLen" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ⑤ 策略對比歷史 */}
      {history.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">⑤ 策略對比</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">策略</th>
                    <th className="pb-2 font-medium">Queue</th>
                    <th className="pb-2 font-medium">成功</th>
                    <th className="pb-2 font-medium">超賣</th>
                    <th className="pb-2 font-medium">耗時</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 text-slate-400">{idx + 1}</td>
                      <td className="py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            h.strategy === "NO_LOCK"
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {h.strategy === "NO_LOCK" ? "無鎖" : "原子"}
                        </span>
                      </td>
                      <td className="py-2">
                        {h.enableQueue ? (
                          <span className="text-xs px-2 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                            {h.rateLimitPerSec}/s
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">OFF</span>
                        )}
                      </td>
                      <td className="py-2">{h.success}</td>
                      <td className="py-2">
                        <span className={h.oversold > 0 ? "text-red-600 font-bold" : "text-emerald-600"}>
                          {h.oversold}
                        </span>
                      </td>
                      <td className="py-2 text-slate-500">{h.elapsedMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-600 mb-2">耗時對比</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={history.map((h, i) => ({
                    name: `#${i + 1} ${h.strategy === "NO_LOCK" ? "無鎖" : "原子"}${h.enableQueue ? "+Q" : ""}`,
                    elapsedMs: h.elapsedMs,
                    oversold: h.oversold,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="elapsedMs" fill="#8b5cf6" name="耗時(ms)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="oversold" fill="#ef4444" name="超賣" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "green" | "red" | "blue" | "slate";
}) {
  const colorMap = {
    green: "bg-emerald-50 text-emerald-900 border-emerald-200",
    red: "bg-red-50 text-red-900 border-red-200",
    blue: "bg-blue-50 text-blue-900 border-blue-200",
    slate: "bg-slate-50 text-slate-900 border-slate-200",
  };
  return (
    <div className={`border rounded-lg p-3 ${colorMap[color]}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}