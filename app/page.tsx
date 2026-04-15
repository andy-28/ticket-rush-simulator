// app/page.tsx
import SimulatorDashboard from "./_components/SimulatorDashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          🎫 搶票模擬器
        </h1>
        <p className="text-slate-600 mb-8">
          高併發系統設計實驗場
        </p>
        <SimulatorDashboard />
      </div>
    </main>
  );
}