import { setIO } from "../lib/socket";
// server/index.ts
import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = Number(process.env.PORT) || 3000;

// 建立 Next.js app instance(還沒啟動,只是準備)
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  // 等 Next.js 把自己準備好(compile、load routes 等)
  await app.prepare();

  // 建立 HTTP server,把 Next.js 當 handler 塞進去
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // 把 Socket.IO attach 到同一個 HTTP server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: dev ? "*" : false, // dev 開放,production 鎖起來
      methods: ["GET", "POST"],
    },
  });
  setIO(io);

  // 最簡單的連線 handler,先確認能通就好
  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);

    socket.on("disconnect", (reason) => {
      console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
    });

    // 測試用:client 發 ping,server 回 pong
    socket.on("ping", (cb) => {
      if (typeof cb === "function") cb("pong");
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO ready on ws://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});