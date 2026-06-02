const OpenAI = require("openai");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { retryAsync } = require("@core/utils/retry");

const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || "eatsy_dishes";
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ||
  process.env.FREELLMAPI_EMBEDDING_MODEL ||
  "qwen3-embedding:0.6b";
const EMBEDDING_BASE_URL =
  process.env.EMBEDDING_BASE_URL || "http://127.0.0.1:11434/v1";
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || "ollama";

let openaiClient;
let qdrantClient;

function getDishPointId(dish) {
  const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
  const dishId = plainDish?.dish_id;

  if (typeof dishId !== "string" || dishId.trim() === "") {
    throw new Error("Dish ID is required for semantic indexing.");
  }

  return dishId;
}

function isSemanticSearchEnabled() {
  return Boolean(
    EMBEDDING_BASE_URL && EMBEDDING_API_KEY && process.env.QDRANT_URL,
  );
}

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: EMBEDDING_API_KEY,
      baseURL: EMBEDDING_BASE_URL,
    });
  }

  return openaiClient;
}

function getQdrantClient() {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY || undefined,
    });
  }

  return qdrantClient;
}

function buildDishEmbeddingText(dish) {
  const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
  const categoryName =
    plainDish?.category?.name ||
    plainDish?.Category?.name ||
    plainDish?.Category?.category_name ||
    "Món ăn";
  const tags = Array.isArray(plainDish?.tags) ? plainDish.tags.join(", ") : "";

  return [
    `Tên món: ${plainDish?.name || "N/A"}`,
    `Thương hiệu: ${plainDish?.brand || "Eatsy"}`,
    `Danh mục: ${categoryName}`,
    `Mô tả: ${plainDish?.description || "Không có mô tả"}`,
    `Giá: ${plainDish?.price || "Liên hệ"} VNĐ`,
    `Tags: ${tags || "Không có"}`,
  ].join(". ");
}

function buildDishPayload(dish) {
  const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
  const categoryName =
    plainDish?.category?.name ||
    plainDish?.Category?.name ||
    plainDish?.Category?.category_name ||
    "N/A";

  return {
    dish_id: plainDish?.dish_id,
    name: plainDish?.name || null,
    brand: plainDish?.brand || null,
    price: plainDish?.price != null ? Number(plainDish.price) : null,
    category: categoryName,
    description: plainDish?.description || null,
    image_url: plainDish?.thumbnail_path || null,
    rating: Number(plainDish?.rating_avg || 0),
    status: plainDish?.status || null,
    available: Boolean(plainDish?.available),
  };
}

async function generateEmbeddingFromText(text) {
  if (!isSemanticSearchEnabled()) {
    throw new Error("Semantic search is not configured.");
  }

  const response = await retryAsync(
    () =>
      getOpenAIClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    {
      retries: 2,
      baseDelayMs: 1000,
      timeoutMs: 5000,
      operationName: "generate dish embedding",
      onRetry: ({ attempt, delayMs, error }) => {
        console.warn(
          `[Retry] Embedding request failed on attempt ${attempt}. Retrying in ${delayMs}ms: ${error.message}`,
        );
      },
    },
  );

  const values = response?.data?.[0]?.embedding;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Embedding response is empty.");
  }

  return values;
}

function normalizeQdrantPoints(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.points)) {
    return result.points;
  }

  if (Array.isArray(result?.result)) {
    return result.result;
  }

  if (Array.isArray(result?.result?.points)) {
    return result.result.points;
  }

  return [];
}

async function queryPoints(vector, limit) {
  const client = getQdrantClient();

  if (typeof client.query === "function") {
    return retryAsync(
      () =>
        client.query(COLLECTION_NAME, {
          query: vector,
          limit,
          with_payload: true,
          with_vector: false,
        }),
      {
        retries: 2,
        baseDelayMs: 1000,
        timeoutMs: 5000,
        operationName: "query Qdrant points",
      },
    );
  }

  if (typeof client.search === "function") {
    return retryAsync(
      () =>
        client.search(COLLECTION_NAME, {
          vector,
          limit,
          with_payload: true,
          with_vector: false,
        }),
      {
        retries: 2,
        baseDelayMs: 1000,
        timeoutMs: 5000,
        operationName: "search Qdrant points",
      },
    );
  }

  throw new Error("Qdrant client does not support query/search.");
}

async function searchDishIdsBySemanticQuery(queryText, limit = 6) {
  if (!isSemanticSearchEnabled()) {
    return [];
  }

  const vector = await generateEmbeddingFromText(queryText);
  const result = await queryPoints(vector, limit);
  const points = normalizeQdrantPoints(result);

  return points
    .map((point) => ({
      dishId: point?.payload?.dish_id,
      score: point?.score ?? 0,
    }))
    .filter(
      (point) => typeof point.dishId === "string" && point.dishId.length > 0,
    );
}

async function upsertDishToSemanticIndex(dish) {
  if (!isSemanticSearchEnabled()) {
    return { skipped: true, reason: "semantic_search_disabled" };
  }

  const client = getQdrantClient();
  const pointId = getDishPointId(dish);
  const vector = await generateEmbeddingFromText(buildDishEmbeddingText(dish));

  await retryAsync(
    () =>
      client.upsert(COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: pointId,
            vector,
            payload: buildDishPayload(dish),
          },
        ],
      }),
    {
      retries: 2,
      baseDelayMs: 1000,
      timeoutMs: 5000,
      operationName: "upsert dish to Qdrant",
    },
  );

  return { skipped: false, pointId };
}

async function removeDishFromSemanticIndex(dishId) {
  if (!isSemanticSearchEnabled()) {
    return { skipped: true, reason: "semantic_search_disabled" };
  }

  if (typeof dishId !== "string" || dishId.trim() === "") {
    throw new Error("Dish ID is required for semantic index deletion.");
  }

  const client = getQdrantClient();
  await retryAsync(
    () =>
      client.delete(COLLECTION_NAME, {
        wait: true,
        points: [dishId],
      }),
    {
      retries: 2,
      baseDelayMs: 1000,
      timeoutMs: 5000,
      operationName: "delete dish from Qdrant",
    },
  );

  return { skipped: false, pointId: dishId };
}

async function getDishPointFromSemanticIndex(dishId) {
  if (!isSemanticSearchEnabled()) {
    return {
      skipped: true,
      reason: "semantic_search_disabled",
      point: null,
    };
  }

  if (typeof dishId !== "string" || dishId.trim() === "") {
    throw new Error("Dish ID is required for semantic index lookup.");
  }

  const client = getQdrantClient();
  const result = await retryAsync(
    () =>
      client.retrieve(COLLECTION_NAME, {
        ids: [dishId],
        with_payload: true,
        with_vector: false,
      }),
    {
      retries: 2,
      baseDelayMs: 1000,
      timeoutMs: 5000,
      operationName: "retrieve dish from Qdrant",
    },
  );

  const point = Array.isArray(result) ? result[0] : result?.[0] || null;

  return {
    skipped: false,
    point: point || null,
  };
}

module.exports = {
  buildDishEmbeddingText,
  buildDishPayload,
  COLLECTION_NAME,
  EMBEDDING_MODEL,
  generateEmbeddingFromText,
  getDishPointId,
  getDishPointFromSemanticIndex,
  getQdrantClient,
  isSemanticSearchEnabled,
  removeDishFromSemanticIndex,
  searchDishIdsBySemanticQuery,
  upsertDishToSemanticIndex,
};
