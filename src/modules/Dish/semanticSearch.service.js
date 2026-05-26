const OpenAI = require("openai");
const { QdrantClient } = require("@qdrant/js-client-rest");

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

async function generateEmbeddingFromText(text) {
  if (!isSemanticSearchEnabled()) {
    throw new Error("Semantic search is not configured.");
  }

  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

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
    return client.query(COLLECTION_NAME, {
      query: vector,
      limit,
      with_payload: true,
      with_vector: false,
    });
  }

  if (typeof client.search === "function") {
    return client.search(COLLECTION_NAME, {
      vector,
      limit,
      with_payload: true,
      with_vector: false,
    });
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

module.exports = {
  buildDishEmbeddingText,
  COLLECTION_NAME,
  EMBEDDING_MODEL,
  generateEmbeddingFromText,
  getQdrantClient,
  isSemanticSearchEnabled,
  searchDishIdsBySemanticQuery,
};
