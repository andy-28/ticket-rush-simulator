# 🎫 搶票模擬器 — Ticket Rush Simulator

一個用於學習**高併發系統設計**的搶票模擬器。模擬真實搶票場景（如拓元售票），探索不同庫存扣減策略在高併發下的表現差異。

## 📸 截圖

### 管理控制台 — 策略對比
> 500 個並發請求搶 100 張票，三種策略的結果對比

| 策略 | 超賣 | 耗時 | 說明 |
|---|---|---|---|
| 🔥 無鎖（讀後寫） | **494 張** | 313ms | 故意展示 race condition |
| ✅ DB 原子扣減 | 0 張 | 318ms | PostgreSQL row lock |
| ⚡ Redis 原子扣減 | 0 張 | **113ms** | Lua script，最快 |

### 搶票體驗頁
> 模擬真實搶票流程：倒數 → 排隊 → 搶票 → 結果

## 🎯 專案目的

這不是一個售票網站，而是一個**系統設計學習工具**：

- 理解為什麼「讀後寫」會導致超賣（race condition）
- 理解 DB 原子操作如何防超賣（row lock + MVCC）
- 理解 Redis 為什麼比 DB 快 3 倍（記憶體 vs 磁碟）
- 理解 Queue 如何做削峰（犧牲延遲換穩定性）
- 理解 Socket.IO 即時推播 vs HTTP polling 的差異

## 🛠 技術棧

| 分類 | 技術 |
|---|---|
| 前端 | Next.js 15 (App Router)、Tailwind CSS、Recharts |
| 後端 | Next.js Route Handlers、自訂 server.js |
| 即時通訊 | Socket.IO |
| 資料庫 | PostgreSQL 16、Prisma ORM |
| 快取 | Redis 7（Lua script 原子操作） |
| 容器 | Docker Compose |

## 🏗 系統架構

```
使用者瀏覽器
    │
    ├── HTTP ──→ Next.js Route Handlers
    │                 │
    │                 ├── 策略切換 ──→ 無鎖 / DB 原子 / Redis 原子
    │                 │                    │              │
    │                 │                    ▼              ▼
    │                 │               PostgreSQL        Redis
    │                 │              (row lock)     (Lua script)
    │                 │
    │                 └── Queue ──→ Rate Limiting ──→ 批次處理
    │
    └── WebSocket ──→ Socket.IO Server
                          │
                          ├── sim:start    (模擬開始)
                          ├── sim:progress (即時進度)
                          └── sim:end      (最終結果)
```

## ✨ 功能列表

### 管理控制台 (`/`)
- 建立 / 刪除 / 重置活動
- 設定模擬參數（請求數、並發數、策略）
- Queue 開關 + Rate Limit 設定
- 即時進度條 + Socket.IO 推播
- Recharts 即時圖表（剩餘票數曲線、成功/失敗累積、排隊人數）
- 策略對比表格 + 長條圖

### 搶票體驗頁 (`/rush/[eventId]`)
- 倒數計時 → Waiting Room 排隊 → 選張數搶票 → 結果頁
- 模擬真實搶票流程
- 即時顯示剩餘票數

### 三種庫存扣減策略
| 策略 | 原理 | 適用場景 |
|---|---|---|
| **無鎖（NO_LOCK）** | `findUnique` → `update`，讀後寫 | ❌ 教學用，展示 race condition |
| **DB 原子（DB_ATOMIC）** | `UPDATE ... WHERE remaining >= qty` | ✅ 中小規模，單一 DB |
| **Redis 原子（REDIS_ATOMIC）** | Lua script `GET + DECRBY` 原子執行 | ✅ 高流量，毫秒級回應 |

### Queue 削峰
- In-memory Queue + 令牌桶式 Rate Limiting
- 將瞬間流量壓平為穩定的每秒處理量
- 即時排隊人數圖表

## 🚀 快速開始

### 環境需求
- Node.js 20+
- Docker（用於 PostgreSQL + Redis）

### 安裝

```bash
git clone https://github.com/你的帳號/ticket-rush-simulator.git
cd ticket-rush-simulator
npm install
```

### 啟動資料庫

```bash
docker compose up -d
docker compose ps  # 確認 postgres 和 redis 都是 healthy
```

### 設定環境變數

```bash
cp .env.example .env
```

`.env` 內容（使用 Docker 的話不需要修改）：
```
DATABASE_URL="postgresql://ticket:ticket_dev_pw@localhost:5432/ticket_rush?schema=public"
PORT=3000
NODE_ENV=development
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 初始化資料庫

```bash
npx prisma migrate dev --name init
```

### 啟動

```bash
npm run dev
```

打開瀏覽器：
- 管理控制台：http://localhost:3000
- 搶票體驗：http://localhost:3000/rush

### 不使用 Docker（Windows / 無 Docker 環境）

如果你的環境沒有 Docker，可以：
1. 使用雲端免費 PostgreSQL（[Neon](https://neon.tech)）和 Redis（[Upstash](https://upstash.com)）
2. 將連線字串填入 `.env`
3. 其他步驟相同

## 📁 專案結構

```
ticket-rush-simulator/
├── app/
│   ├── _components/
│   │   └── SimulatorDashboard.tsx   # 管理控制台主元件
│   ├── api/
│   │   ├── events/                  # 活動 CRUD + 重置
│   │   ├── purchase/                # 搶票 API（策略切換）
│   │   └── simulate/                # 模擬攻擊 API
│   ├── rush/
│   │   ├── page.tsx                 # 搶票入口（活動列表）
│   │   └── [eventId]/
│   │       ├── page.tsx             # Server Component（查 DB）
│   │       └── RushClient.tsx       # 搶票體驗 Client Component
│   ├── layout.tsx
│   └── page.tsx                     # 管理控制台首頁
├── lib/
│   ├── services/
│   │   ├── purchaseService.ts       # 三種扣減策略實作
│   │   └── queueService.ts          # In-memory Queue
│   ├── db.ts                        # Prisma client 單例
│   ├── redis.ts                     # Redis client 單例
│   └── socket.ts                    # Socket.IO instance 管理
├── server/
│   └── index.ts                     # 自訂 server（Next.js + Socket.IO）
├── prisma/
│   └── schema.prisma                # 資料模型
├── scripts/
│   └── attack-count.mjs             # CLI 攻擊腳本（測試用）
├── docker-compose.yml               # PostgreSQL + Redis
└── package.json
```

## 🔬 核心實驗數據

### 實驗條件
- 活動：100 張票
- 請求：500 個
- 並發：100 個

### 實驗結果

| 策略 | Queue | 成功 | 超賣 | 耗時 |
|---|---|---|---|---|
| 🔥 無鎖 | OFF | 500 | **494** | 313ms |
| ✅ DB 原子 | OFF | 100 | 0 | 318ms |
| ⚡ Redis | OFF | 100 | 0 | **113ms** |
| ✅ DB 原子 | 50/s | 100 | 0 | 10,586ms |

### 關鍵發現
1. **無鎖策略**：500 人都收到「搶到了」，但 DB 只扣了 6 張 → 超賣 494 張
2. **DB 原子**：利用 PostgreSQL 的 row lock，保證「檢查 + 扣減」是原子操作
3. **Redis**：比 DB 快 3 倍，因為純記憶體操作 + Lua script 原子性
4. **Queue**：耗時從 318ms 變成 10.5s，但 DB 每秒只承受 50 個請求，不會被打爆

## 📚 學到的觀念

| 觀念 | 說明 |
|---|---|
| Race Condition | 多個 async 操作交錯導致讀後寫不一致 |
| Row Lock (Postgres) | `UPDATE ... WHERE` 自動對該行加鎖 |
| MVCC | 讀不擋寫，寫不擋讀 |
| Lua Script (Redis) | Server-side scripting，不可被中斷的原子操作 |
| 削峰 (Peak Shaving) | Queue 將瞬間流量壓平為穩定輸出 |
| 熱路徑做薄 | 搶票瞬間只動計數器，確權非同步做 |
| globalThis 單例 | 避免 Next.js hot reload 導致多個 DB/Redis 連線 |
| Strategy Pattern | 統一入口切換不同扣減策略 |

## 📜 可用指令

```bash
npm run dev          # 開發模式（自訂 server + Socket.IO）
npm run build        # 建置
npm run start        # 生產模式
npm run db:migrate   # 跑 Prisma migration
npm run db:studio    # 開啟 Prisma Studio（DB GUI）
npm run db:reset     # 重置資料庫
```

## 🗺 未來可擴展方向

- [ ] DB Transaction + SELECT FOR UPDATE 策略
- [ ] Redis Queue（BullMQ）取代 in-memory queue
- [ ] Waiting Room 真實排隊（server 端控制放行）
- [ ] 多場次 / 多票種支援
- [ ] 延遲分布圖（P50 / P95 / P99）
- [ ] 部署到雲端（Vercel + Neon + Upstash）
- [ ] CAPTCHA / 防機器人

## 📄 License

MIT