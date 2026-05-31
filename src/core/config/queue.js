const { Queue } = require("bullmq");
const IORedis = require("ioredis");

/**
 * BullMQ requires ioredis (not the node-redis client used in redis.js).
 * We build the connection from the same environment variables.
 */

function buildRedisConnection() {
  if (process.env.REDIS_URL) {
    return new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }

  return new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    maxRetriesPerRequest: null, // Required by BullMQ
  });
}

const redisConnection = buildRedisConnection();

redisConnection.on("error", (err) => {
  console.error("[BullMQ Redis] Connection error:", err.message);
});

redisConnection.on("connect", () => {
  console.log("[BullMQ Redis] Connected successfully");
});

const orderQueue = new Queue("order-events", {
  connection: redisConnection,
});

module.exports = { orderQueue, redisConnection };
