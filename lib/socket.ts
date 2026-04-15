// lib/socket.ts
import { Server as SocketIOServer } from "socket.io";

const globalForIO = globalThis as unknown as {
  _io: SocketIOServer | undefined;
};

export function setIO(server: SocketIOServer) {
  globalForIO._io = server;
}

export function getIO(): SocketIOServer | null {
  return globalForIO._io ?? null;
}