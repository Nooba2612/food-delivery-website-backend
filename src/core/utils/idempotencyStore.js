const crypto = require("crypto");
const { getRedisClient, isRedisEnabled } = require("@core/config/redis");

const IDEMPOTENCY_TTL_SECONDS = parseInt(
  process.env.IDEMPOTENCY_TTL_SECONDS || "900",
  10,
);
const PREFIX = "idempotency";
const memoryStore = new Map();

function buildStoreKey(scope, userId, requestId) {
  return `${PREFIX}:${scope}:${userId}:${requestId}`;
}

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
}

function getExpiryTimestamp() {
  return Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000;
}

function cleanupExpiredMemoryEntries() {
  const now = Date.now();

  for (const [key, value] of memoryStore.entries()) {
    if (value.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}

async function getExistingRecord(storeKey) {
  if (isRedisEnabled()) {
    try {
      const client = await getRedisClient();
      const raw = await client.get(storeKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      console.warn("[Idempotency] Redis unavailable, using memory fallback.");
    }
  }

  cleanupExpiredMemoryEntries();
  const memoryRecord = memoryStore.get(storeKey);
  return memoryRecord ? memoryRecord.value : null;
}

async function saveRecord(storeKey, record) {
  if (isRedisEnabled()) {
    try {
      const client = await getRedisClient();
      await client.set(storeKey, JSON.stringify(record), {
        EX: IDEMPOTENCY_TTL_SECONDS,
      });
      return;
    } catch {
      console.warn("[Idempotency] Failed to persist to Redis, using memory fallback.");
    }
  }

  memoryStore.set(storeKey, {
    value: record,
    expiresAt: getExpiryTimestamp(),
  });
}

async function deleteRecord(storeKey) {
  if (isRedisEnabled()) {
    try {
      const client = await getRedisClient();
      await client.del(storeKey);
      return;
    } catch {
      console.warn("[Idempotency] Failed to remove Redis key, using memory fallback.");
    }
  }

  memoryStore.delete(storeKey);
}

async function reserveIdempotencyKey({
  scope,
  userId,
  requestId,
  payload,
}) {
  if (!requestId) {
    return {
      status: "missing",
    };
  }

  const storeKey = buildStoreKey(scope, userId, requestId);
  const payloadHash = hashPayload(payload);
  const existingRecord = await getExistingRecord(storeKey);

  if (existingRecord) {
    if (existingRecord.payloadHash !== payloadHash) {
      return {
        status: "conflict",
      };
    }

    if (existingRecord.status === "completed") {
      return {
        status: "replay",
        response: existingRecord.response,
      };
    }

    return {
      status: "in_progress",
    };
  }

  await saveRecord(storeKey, {
    status: "processing",
    payloadHash,
    createdAt: new Date().toISOString(),
  });

  return {
    status: "reserved",
    storeKey,
  };
}

async function completeIdempotencyKey(storeKey, response) {
  if (!storeKey) {
    return;
  }

  const existingRecord = await getExistingRecord(storeKey);
  if (!existingRecord) {
    return;
  }

  await saveRecord(storeKey, {
    ...existingRecord,
    status: "completed",
    response,
    completedAt: new Date().toISOString(),
  });
}

async function releaseIdempotencyKey(storeKey) {
  if (!storeKey) {
    return;
  }

  await deleteRecord(storeKey);
}

module.exports = {
  completeIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
};
