import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  _redis: Redis | undefined;
};

export const redis =
  globalForRedis._redis ??
  new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT) ?? 6379,
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis._redis = redis;
}