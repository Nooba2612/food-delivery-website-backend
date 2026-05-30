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
const EMBEDDING_TIMEOUT_MS = Number(process.env.EMBEDDING_TIMEOUT_MS || 20000);
const QDRANT_OPERATION_TIMEOUT_MS = Number(
  process.env.QDRANT_OPERATION_TIMEOUT_MS || 10000,
);

let openaiClient;
let qdrantClient;

function normalizeMetadataText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function countBeefPattyHints(text) {
  const normalizedText = normalizeMetadataText(text);

  if (normalizedText.includes("triple")) {
    return 3;
  }

  if (normalizedText.includes("double")) {
    return 2;
  }

  const explicitCountMatch =
    normalizedText.match(/\b(\d+)\s+(mieng\s+bo|patty)\b/) ||
    normalizedText.match(/\b(\d+)\s+x\s+bo\b/);
  const explicitCount = Number(explicitCountMatch?.[1] || 0);
  if (Number.isInteger(explicitCount) && explicitCount > 0) {
    return explicitCount;
  }

  if (
    normalizedText.includes("double whopper") ||
    normalizedText.includes("double cheeseburger") ||
    normalizedText.includes("double bbq bacon cheese")
  ) {
    return 2;
  }

  if (
    normalizedText.includes("whopper") ||
    normalizedText.includes("cheeseburger") ||
    normalizedText.includes("burger bo")
  ) {
    return 1;
  }

  return 0;
}

function deriveDishMetadata(dish) {
  const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
  const categoryName =
    plainDish?.category?.name ||
    plainDish?.Category?.name ||
    plainDish?.Category?.category_name ||
    "";
  const searchableText = normalizeMetadataText(
    [
      plainDish?.name,
      plainDish?.description,
      plainDish?.brand,
      categoryName,
      Array.isArray(plainDish?.tags) ? plainDish.tags.join(" ") : "",
    ]
      .filter(Boolean)
      .join(" "),
  );

  const isCombo =
    searchableText.includes("combo") ||
    normalizeMetadataText(categoryName) === "combos";
  const hasBeef =
    searchableText.includes("thit bo") ||
    searchableText.includes("bo nuong") ||
    searchableText.includes("beef") ||
    searchableText.includes("whopper") ||
    searchableText.includes("cheeseburger");
  const hasChicken =
    searchableText.includes("ga") ||
    searchableText.includes("chicken") ||
    searchableText.includes("chic") ||
    searchableText.includes("crispy chicken");
  const hasSeafood =
    searchableText.includes("hai san") ||
    searchableText.includes("tom") ||
    searchableText.includes("muc") ||
    searchableText.includes("ca hoi") ||
    searchableText.includes("seafood");
  const hasCheese =
    searchableText.includes("pho mai") ||
    searchableText.includes("cheese") ||
    searchableText.includes("parmesan");
  const hasRice =
    searchableText.includes("com") ||
    normalizeMetadataText(categoryName).includes("com");
  const hasNoodles =
    searchableText.includes("mi ") ||
    searchableText.includes("spaghetti") ||
    searchableText.includes("carbonara") ||
    searchableText.includes("bolognese");
  const hasDrink =
    searchableText.includes("coca") ||
    searchableText.includes("milo") ||
    searchableText.includes("nuoc");

  let servingForm = "dish";
  if (normalizeMetadataText(categoryName).includes("burger")) {
    servingForm = "burger";
  } else if (normalizeMetadataText(categoryName).includes("pizza")) {
    servingForm = "pizza";
  } else if (normalizeMetadataText(categoryName).includes("nuoc")) {
    servingForm = "drink";
  } else if (hasRice) {
    servingForm = "rice";
  } else if (hasNoodles) {
    servingForm = "noodles";
  }

  const price = Number(plainDish?.price || 0);
  const priceBand =
    price <= 50000
      ? "budget"
      : price <= 100000
        ? "standard"
        : price <= 200000
          ? "premium"
          : "luxury";

  const beefPattyCount = hasBeef ? countBeefPattyHints(searchableText) : 0;

  let primaryProtein = "other";
  if (hasBeef) {
    primaryProtein = "beef";
  } else if (hasChicken) {
    primaryProtein = "chicken";
  } else if (hasSeafood) {
    primaryProtein = "seafood";
  }

  return {
    serving_form: servingForm,
    primary_protein: primaryProtein,
    has_beef: hasBeef,
    has_chicken: hasChicken,
    has_seafood: hasSeafood,
    has_cheese: hasCheese,
    has_rice: hasRice,
    has_noodles: hasNoodles,
    has_drink: hasDrink,
    is_combo: isCombo,
    beef_patty_count: beefPattyCount,
    price_band: priceBand,
  };
}

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
  const metadata = deriveDishMetadata(plainDish);

  return [
    `Tên món: ${plainDish?.name || "N/A"}`,
    `Thương hiệu: ${plainDish?.brand || "Eatsy"}`,
    `Danh mục: ${categoryName}`,
    `Mô tả: ${plainDish?.description || "Không có mô tả"}`,
    `Giá: ${plainDish?.price || "Liên hệ"} VNĐ`,
    `Tags: ${tags || "Không có"}`,
    `Metadata: protein=${metadata.primary_protein}, form=${metadata.serving_form}, combo=${metadata.is_combo}, cheese=${metadata.has_cheese}, beef_patty_count=${metadata.beef_patty_count}, price_band=${metadata.price_band}`,
  ].join(". ");
}

function buildDishPayload(dish) {
  const plainDish = dish?.get ? dish.get({ plain: true }) : dish;
  const categoryName =
    plainDish?.category?.name ||
    plainDish?.Category?.name ||
    plainDish?.Category?.category_name ||
    "N/A";
  const metadata = deriveDishMetadata(plainDish);

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
    ...metadata,
    metadata,
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
      timeoutMs: EMBEDDING_TIMEOUT_MS,
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
        timeoutMs: QDRANT_OPERATION_TIMEOUT_MS,
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
        timeoutMs: QDRANT_OPERATION_TIMEOUT_MS,
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
      timeoutMs: QDRANT_OPERATION_TIMEOUT_MS,
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
      timeoutMs: QDRANT_OPERATION_TIMEOUT_MS,
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
      timeoutMs: QDRANT_OPERATION_TIMEOUT_MS,
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
  deriveDishMetadata,
  generateEmbeddingFromText,
  getDishPointId,
  getDishPointFromSemanticIndex,
  getQdrantClient,
  isSemanticSearchEnabled,
  removeDishFromSemanticIndex,
  searchDishIdsBySemanticQuery,
  upsertDishToSemanticIndex,
};
