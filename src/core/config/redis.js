const { createClient } = require("redis");

let redisClient;
let redisConnectPromise;

function isRedisEnabled() {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
}

function buildRedisUrl() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = process.env.REDIS_PORT || "6379";
  const db = process.env.REDIS_DB || "0";
  const password = process.env.REDIS_PASSWORD;

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}/${db}`;
  }

  return `redis://${host}:${port}/${db}`;
}

async function getRedisClient() {
  if (!isRedisEnabled()) {
    throw new Error("Redis is not configured.");
  }

  if (!redisClient) {
    redisClient = createClient({
      url: buildRedisUrl(),
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });

    redisClient.on("error", (error) => {
      console.error("[Redis] Client error:", error.message);
    });
  }

  if (!redisClient.isOpen) {
    redisConnectPromise =
      redisConnectPromise ||
      redisClient.connect().finally(() => {
        redisConnectPromise = null;
      });

    await redisConnectPromise;
  }

  return redisClient;
}

module.exports = {
  getRedisClient,
  isRedisEnabled,
};
