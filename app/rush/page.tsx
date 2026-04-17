// app/rush/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RushListPage() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-2">🎫 搶票入口</h1>
        <p className="text-slate-400 mb-10">選擇一場活動進入搶票</p>

        {events.length === 0 ? (
          <p className="text-slate-500">
            目前沒有活動，請先到
            <Link href="/" className="text-blue-400 underline ml-1">
              控制台
            </Link>
            建立。
          </p>
        ) : (
          <div className="space-y-4">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/rush/${ev.id}`}
                className="block bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-blue-500 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold">{ev.name}</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      {ev.totalTickets} 張票 · 剩餘 {ev.remaining} 張
                    </p>
                  </div>
                  <div className="text-right">
                    {ev.remaining > 0 ? (
                      <span className="text-sm bg-emerald-900 text-emerald-300 px-3 py-1 rounded-full">
                        可搶票
                      </span>
                    ) : (
                      <span className="text-sm bg-red-900 text-red-300 px-3 py-1 rounded-full">
                        已售完
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            ← 回到管理控制台
          </Link>
        </div>
      </div>
    </main>
  );
}